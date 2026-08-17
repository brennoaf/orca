#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

enum class MediaCommand { Previous, TogglePlayPause, Next };

struct MediaArtwork {
  std::string mimeType;
  std::vector<std::uint8_t> bytes;
};

struct MediaCapabilities {
  bool previous;
  bool togglePlayPause;
  bool next;
};

struct MediaSession {
  std::string sessionId;
  std::string sourceAppUserModelId;
  std::string playbackStatus;
  std::string title;
  std::string artist;
  std::string albumTitle;
  std::string mediaIdentity;
  double positionMs;
  double durationMs;
  MediaArtwork artwork;
  bool hasArtwork;
  MediaCapabilities capabilities;
};

std::vector<MediaSession> ListMediaSessions();
bool ExecuteMediaCommand(MediaCommand command, std::string const& sessionId);
std::optional<double> GetMediaSessionAudioPeak(std::string const& sessionId);
