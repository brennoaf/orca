#include "windows-media-control.h"

#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Media.Control.h>
#include <winrt/Windows.Media.h>
#include <winrt/Windows.Storage.Streams.h>
#include <winrt/base.h>
#include <audiopolicy.h>
#include <appmodel.h>
#include <endpointvolume.h>
#include <mmdeviceapi.h>
#include <windows.h>
#include <map>
#include <mutex>
#include <algorithm>
#include <cctype>
#include <cwchar>
#include <sstream>
#include <optional>

namespace {
using Session = winrt::Windows::Media::Control::GlobalSystemMediaTransportControlsSession;
using PlaybackStatus = winrt::Windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackStatus;

constexpr std::uint64_t MaxArtworkBytes = 2ULL * 1024ULL * 1024ULL;
constexpr double HundredNanosecondsPerMillisecond = 10000.0;

struct ArtworkCacheEntry {
  std::string identity;
  MediaArtwork artwork;
  bool hasArtwork;
};

std::map<std::string, ArtworkCacheEntry> artworkCache;
std::mutex artworkCacheMutex;

class Apartment {
 public:
  Apartment() { winrt::init_apartment(winrt::apartment_type::multi_threaded); }
  ~Apartment() { winrt::uninit_apartment(); }
};

std::string PlaybackStatusName(PlaybackStatus status) {
  switch (status) {
    case PlaybackStatus::Playing:
      return "playing";
    case PlaybackStatus::Paused:
      return "paused";
    case PlaybackStatus::Stopped:
      return "stopped";
    case PlaybackStatus::Closed:
      return "closed";
    default:
      return "unknown";
  }
}

std::string SessionId(std::string const& source, std::map<std::string, std::size_t>& counts) {
  auto const occurrence = ++counts[source];
  return occurrence == 1 ? source : source + "#" + std::to_string(occurrence);
}

double Milliseconds(winrt::Windows::Foundation::TimeSpan value) {
  return static_cast<double>(value.count()) / HundredNanosecondsPerMillisecond;
}

MediaArtwork ReadArtwork(
    winrt::Windows::Storage::Streams::IRandomAccessStreamReference const& reference,
    bool& hasArtwork) {
  hasArtwork = false;
  if (!reference) return {};
  auto stream = reference.OpenReadAsync().get();
  auto const size = stream.Size();
  if (size == 0 || size > MaxArtworkBytes || size > UINT32_MAX) return {};
  auto reader = winrt::Windows::Storage::Streams::DataReader(stream.GetInputStreamAt(0));
  auto const loaded = reader.LoadAsync(static_cast<std::uint32_t>(size)).get();
  if (loaded == 0) return {};
  MediaArtwork artwork;
  artwork.mimeType = winrt::to_string(stream.ContentType());
  artwork.bytes.resize(loaded);
  reader.ReadBytes(artwork.bytes);
  hasArtwork = true;
  return artwork;
}

MediaArtwork CachedArtwork(
    std::string const& sessionId,
    std::string const& identity,
    winrt::Windows::Storage::Streams::IRandomAccessStreamReference const& reference,
    bool& hasArtwork) {
  {
    std::scoped_lock lock(artworkCacheMutex);
    auto const cached = artworkCache.find(sessionId);
    if (cached != artworkCache.end() && cached->second.identity == identity) {
      hasArtwork = cached->second.hasArtwork;
      return cached->second.artwork;
    }
  }
  auto artwork = ReadArtwork(reference, hasArtwork);
  {
    std::scoped_lock lock(artworkCacheMutex);
    if (artworkCache.size() >= 16 && artworkCache.find(sessionId) == artworkCache.end()) {
      artworkCache.clear();
    }
    artworkCache[sessionId] = {identity, artwork, hasArtwork};
  }
  return artwork;
}

MediaSession ReadSession(
    Session const& session,
    std::map<std::string, std::size_t>& sourceCounts) {
  auto const source = winrt::to_string(session.SourceAppUserModelId());
  auto const playback = session.GetPlaybackInfo();
  auto const controls = playback.Controls();
  auto const timeline = session.GetTimelineProperties();
  auto const properties = session.TryGetMediaPropertiesAsync().get();
  auto const title = winrt::to_string(properties.Title());
  auto const artist = winrt::to_string(properties.Artist());
  auto const album = winrt::to_string(properties.AlbumTitle());
  auto const duration = Milliseconds(timeline.EndTime() - timeline.StartTime());
  auto const position = Milliseconds(timeline.Position() - timeline.StartTime());
  auto const sessionId = SessionId(source, sourceCounts);
  std::ostringstream identity;
  identity << title << '\x1f' << artist << '\x1f' << album << '\x1f' << duration;
  bool hasArtwork = false;
  auto const mediaIdentity = identity.str();
  auto artwork = CachedArtwork(sessionId, mediaIdentity, properties.Thumbnail(), hasArtwork);
  return {
      sessionId,
      source,
      PlaybackStatusName(playback.PlaybackStatus()),
      title,
      artist,
      album,
      mediaIdentity,
      position,
      duration,
      std::move(artwork),
      hasArtwork,
      {
          controls.IsPreviousEnabled(),
          controls.IsPlayPauseToggleEnabled(),
          controls.IsNextEnabled(),
      },
  };
}

std::vector<Session> Sessions() {
  auto manager = winrt::Windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager::RequestAsync().get();
  auto const sessions = manager.GetSessions();
  return {sessions.begin(), sessions.end()};
}

Session FindSession(std::vector<Session> const& sessions, std::string const& targetId) {
  std::map<std::string, std::size_t> sourceCounts;
  for (auto const& session : sessions) {
    auto const source = winrt::to_string(session.SourceAppUserModelId());
    if (SessionId(source, sourceCounts) == targetId) return session;
  }
  return nullptr;
}

bool IsSpotifySource(std::string const& source) {
  std::string lower = source;
  std::transform(lower.begin(), lower.end(), lower.begin(), [](unsigned char value) {
    return static_cast<char>(std::tolower(value));
  });
  return lower == "spotify.exe" || lower.rfind("spotifyab.spotifymusic_", 0) == 0;
}

std::wstring PackageFamilyName(DWORD processId) {
  auto process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, processId);
  if (!process) return {};
  UINT32 length = 0;
  auto const first = GetPackageFamilyName(process, &length, nullptr);
  if (first != ERROR_INSUFFICIENT_BUFFER || length == 0) {
    CloseHandle(process);
    return {};
  }
  std::wstring result(length, L'\0');
  auto const status = GetPackageFamilyName(process, &length, result.data());
  CloseHandle(process);
  if (status != ERROR_SUCCESS) return {};
  result.resize(length == 0 ? 0 : length - 1);
  return result;
}

bool SessionMatchesSource(IAudioSessionControl2* session, std::string const& source) {
  DWORD processId = 0;
  if (FAILED(session->GetProcessId(&processId)) || processId == 0) return false;
  std::string lower = source;
  std::transform(lower.begin(), lower.end(), lower.begin(), [](unsigned char value) {
    return static_cast<char>(std::tolower(value));
  });
  if (lower == "spotify.exe") {
    auto process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, processId);
    if (!process) return false;
    std::wstring path(32768, L'\0');
    DWORD length = static_cast<DWORD>(path.size());
    auto const matched = QueryFullProcessImageNameW(process, 0, path.data(), &length) &&
        length >= 12 && _wcsicmp(path.c_str() + length - 12, L"\\spotify.exe") == 0;
    CloseHandle(process);
    return matched;
  }
  auto const separator = source.find('!');
  if (separator == std::string::npos) return false;
  return winrt::to_string(winrt::hstring(PackageFamilyName(processId))) == source.substr(0, separator);
}
}

std::vector<MediaSession> ListMediaSessions() {
  Apartment apartment;
  auto const sessions = Sessions();
  std::map<std::string, std::size_t> sourceCounts;
  std::vector<MediaSession> result;
  result.reserve(sessions.size());
  for (auto const& session : sessions) result.push_back(ReadSession(session, sourceCounts));
  return result;
}

bool ExecuteMediaCommand(MediaCommand command, std::string const& sessionId) {
  Apartment apartment;
  auto const session = FindSession(Sessions(), sessionId);
  if (!session) return false;
  switch (command) {
    case MediaCommand::Previous:
      return session.TrySkipPreviousAsync().get();
    case MediaCommand::TogglePlayPause:
      return session.TryTogglePlayPauseAsync().get();
    case MediaCommand::Next:
      return session.TrySkipNextAsync().get();
  }
  return false;
}

std::optional<double> GetMediaSessionAudioPeak(std::string const& sessionId) {
  Apartment apartment;
  auto const session = FindSession(Sessions(), sessionId);
  if (!session) return std::nullopt;
  auto const source = winrt::to_string(session.SourceAppUserModelId());
  if (!IsSpotifySource(source)) return std::nullopt;
  winrt::com_ptr<IMMDeviceEnumerator> devices;
  winrt::check_hresult(CoCreateInstance(
      __uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL, IID_PPV_ARGS(devices.put())));
  winrt::com_ptr<IMMDeviceCollection> collection;
  winrt::check_hresult(devices->EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE, collection.put()));
  UINT deviceCount = 0;
  winrt::check_hresult(collection->GetCount(&deviceCount));
  for (UINT deviceIndex = 0; deviceIndex < deviceCount; ++deviceIndex) {
    winrt::com_ptr<IMMDevice> device;
    winrt::check_hresult(collection->Item(deviceIndex, device.put()));
    winrt::com_ptr<IAudioSessionManager2> manager;
    winrt::check_hresult(device->Activate(__uuidof(IAudioSessionManager2), CLSCTX_ALL, nullptr, manager.put_void()));
    winrt::com_ptr<IAudioSessionEnumerator> sessions;
    winrt::check_hresult(manager->GetSessionEnumerator(sessions.put()));
    int count = 0;
    winrt::check_hresult(sessions->GetCount(&count));
    for (int index = 0; index < count; ++index) {
      winrt::com_ptr<IAudioSessionControl> control;
      winrt::check_hresult(sessions->GetSession(index, control.put()));
      auto control2 = control.try_as<IAudioSessionControl2>();
      if (!control2 || !SessionMatchesSource(control2.get(), source)) continue;
      auto meter = control.try_as<IAudioMeterInformation>();
      if (!meter) continue;
      float peak = 0;
      if (SUCCEEDED(meter->GetPeakValue(&peak))) {
        return std::clamp(static_cast<double>(peak), 0.0, 1.0);
      }
    }
  }
  return std::nullopt;
}
