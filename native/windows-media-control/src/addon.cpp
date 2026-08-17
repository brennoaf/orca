#include "windows-media-control.h"

#include <node_api.h>
#include <winrt/base.h>
#include <memory>
#include <stdexcept>

namespace {
enum class OperationKind { ListSessions, AudioPeak, Previous, TogglePlayPause, Next };

struct OperationState {
  napi_env env;
  napi_async_work work;
  napi_deferred deferred;
  OperationKind kind;
  std::string sessionId;
  std::vector<MediaSession> sessions;
  std::optional<double> audioPeak;
  bool commandResult;
  std::string error;
};

void Check(napi_status status) {
  if (status != napi_ok) throw std::runtime_error("N-API operation failed");
}

napi_value String(napi_env env, std::string const& value) {
  napi_value result;
  Check(napi_create_string_utf8(env, value.c_str(), value.size(), &result));
  return result;
}

napi_value Number(napi_env env, double value) {
  napi_value result;
  Check(napi_create_double(env, value, &result));
  return result;
}

napi_value Boolean(napi_env env, bool value) {
  napi_value result;
  Check(napi_get_boolean(env, value, &result));
  return result;
}

napi_value Object(napi_env env) {
  napi_value result;
  Check(napi_create_object(env, &result));
  return result;
}

void Set(napi_env env, napi_value object, char const* name, napi_value value) {
  Check(napi_set_named_property(env, object, name, value));
}

napi_value Artwork(napi_env env, MediaSession const& session) {
  if (!session.hasArtwork) {
    napi_value result;
    Check(napi_get_null(env, &result));
    return result;
  }
  auto result = Object(env);
  napi_value bytes;
  Check(napi_create_buffer_copy(
      env,
      session.artwork.bytes.size(),
      session.artwork.bytes.data(),
      nullptr,
      &bytes));
  Set(env, result, "mimeType", String(env, session.artwork.mimeType));
  Set(env, result, "bytes", bytes);
  return result;
}

napi_value Capabilities(napi_env env, MediaCapabilities const& capabilities) {
  auto result = Object(env);
  Set(env, result, "previous", Boolean(env, capabilities.previous));
  Set(env, result, "togglePlayPause", Boolean(env, capabilities.togglePlayPause));
  Set(env, result, "next", Boolean(env, capabilities.next));
  return result;
}

napi_value Session(napi_env env, MediaSession const& session) {
  auto result = Object(env);
  Set(env, result, "sessionId", String(env, session.sessionId));
  Set(env, result, "sourceAppUserModelId", String(env, session.sourceAppUserModelId));
  Set(env, result, "playbackStatus", String(env, session.playbackStatus));
  Set(env, result, "title", String(env, session.title));
  Set(env, result, "artist", String(env, session.artist));
  Set(env, result, "albumTitle", String(env, session.albumTitle));
  Set(env, result, "mediaIdentity", String(env, session.mediaIdentity));
  Set(env, result, "positionMs", Number(env, session.positionMs));
  Set(env, result, "durationMs", Number(env, session.durationMs));
  Set(env, result, "artwork", Artwork(env, session));
  Set(env, result, "capabilities", Capabilities(env, session.capabilities));
  return result;
}

std::string ReadSessionId(napi_env env, napi_callback_info info) {
  std::size_t argc = 1;
  napi_value args[1];
  Check(napi_get_cb_info(env, info, &argc, args, nullptr, nullptr));
  if (argc != 1) throw std::runtime_error("sessionId is required");
  napi_valuetype type;
  Check(napi_typeof(env, args[0], &type));
  if (type != napi_string) throw std::runtime_error("sessionId must be a string");
  std::size_t length = 0;
  Check(napi_get_value_string_utf8(env, args[0], nullptr, 0, &length));
  std::string result(length, '\0');
  Check(napi_get_value_string_utf8(env, args[0], result.data(), length + 1, &length));
  if (result.empty()) throw std::runtime_error("sessionId must not be empty");
  return result;
}

MediaCommand Command(OperationKind kind) {
  if (kind == OperationKind::Previous) return MediaCommand::Previous;
  if (kind == OperationKind::TogglePlayPause) return MediaCommand::TogglePlayPause;
  return MediaCommand::Next;
}

void Execute(napi_env, void* data) {
  auto* state = static_cast<OperationState*>(data);
  try {
    if (state->kind == OperationKind::ListSessions) {
      state->sessions = ListMediaSessions();
    } else if (state->kind == OperationKind::AudioPeak) {
      state->audioPeak = GetMediaSessionAudioPeak(state->sessionId);
    } else {
      state->commandResult = ExecuteMediaCommand(Command(state->kind), state->sessionId);
    }
  } catch (winrt::hresult_error const& error) {
    state->error = winrt::to_string(error.message());
  } catch (std::exception const& error) {
    state->error = error.what();
  }
}

void Complete(napi_env env, napi_status status, void* data) {
  std::unique_ptr<OperationState> state(static_cast<OperationState*>(data));
  try {
    if (status != napi_ok && state->error.empty()) state->error = "async work failed";
    if (!state->error.empty()) {
      napi_value error;
      auto message = String(env, state->error);
      Check(napi_create_error(env, nullptr, message, &error));
      Check(napi_reject_deferred(env, state->deferred, error));
    } else if (state->kind == OperationKind::ListSessions) {
      napi_value result;
      Check(napi_create_array_with_length(env, state->sessions.size(), &result));
      for (std::size_t index = 0; index < state->sessions.size(); ++index) {
        Check(napi_set_element(env, result, index, Session(env, state->sessions[index])));
      }
      Check(napi_resolve_deferred(env, state->deferred, result));
    } else if (state->kind == OperationKind::AudioPeak) {
      if (state->audioPeak) {
        Check(napi_resolve_deferred(env, state->deferred, Number(env, *state->audioPeak)));
      } else {
        napi_value result;
        Check(napi_get_null(env, &result));
        Check(napi_resolve_deferred(env, state->deferred, result));
      }
    } else {
      Check(napi_resolve_deferred(env, state->deferred, Boolean(env, state->commandResult)));
    }
  } catch (std::exception const& error) {
    napi_value rejection;
    auto message = String(env, error.what());
    napi_create_error(env, nullptr, message, &rejection);
    napi_reject_deferred(env, state->deferred, rejection);
  }
  napi_delete_async_work(env, state->work);
}

napi_value Start(napi_env env, napi_callback_info info, OperationKind kind) {
  auto state = std::make_unique<OperationState>();
  state->env = env;
  state->work = nullptr;
  state->deferred = nullptr;
  state->kind = kind;
  state->commandResult = false;
  try {
    if (kind != OperationKind::ListSessions) state->sessionId = ReadSessionId(env, info);
    napi_value promise;
    napi_value name;
    Check(napi_create_promise(env, &state->deferred, &promise));
    Check(napi_create_string_utf8(env, "windowsMediaControl", NAPI_AUTO_LENGTH, &name));
    Check(napi_create_async_work(
        env,
        nullptr,
        name,
        Execute,
        Complete,
        state.get(),
        &state->work));
    Check(napi_queue_async_work(env, state->work));
    state.release();
    return promise;
  } catch (std::exception const& error) {
    napi_throw_error(env, nullptr, error.what());
    return nullptr;
  }
}

napi_value ListSessions(napi_env env, napi_callback_info info) {
  return Start(env, info, OperationKind::ListSessions);
}

napi_value AudioPeak(napi_env env, napi_callback_info info) {
  return Start(env, info, OperationKind::AudioPeak);
}

napi_value Previous(napi_env env, napi_callback_info info) {
  return Start(env, info, OperationKind::Previous);
}

napi_value TogglePlayPause(napi_env env, napi_callback_info info) {
  return Start(env, info, OperationKind::TogglePlayPause);
}

napi_value Next(napi_env env, napi_callback_info info) {
  return Start(env, info, OperationKind::Next);
}
}

napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
      {"listSessions", nullptr, ListSessions, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"audioPeak", nullptr, AudioPeak, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"previous", nullptr, Previous, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"togglePlayPause", nullptr, TogglePlayPause, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"next", nullptr, Next, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(env, exports, sizeof(properties) / sizeof(properties[0]), properties);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
