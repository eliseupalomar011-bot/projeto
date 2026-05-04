#include <windows.h>
#include <filesystem>
#include <fstream>
#include <string>

// Include SCS SDK headers
#include "scs/scssdk_telemetry.h"
#include "scs/scssdk_input.h"
#include "scs/scssdk_input_device.h"
#include "scs/scssdk_input_event.h"

namespace {

bool g_truckLocked = false;
ULONGLONG g_lastReadTick = 0;
bool g_deviceActive = false;

std::wstring commandFilePath() {
  wchar_t profile[MAX_PATH] = {};
  DWORD size = GetEnvironmentVariableW(L"USERPROFILE", profile, MAX_PATH);
  if (size == 0 || size >= MAX_PATH) return L"";
  return std::wstring(profile) + L"\\Documents\\ETS2Freight\\truck-lock.json";
}

bool fileContainsLockedTrue(const std::wstring& path) {
  std::ifstream file{std::filesystem::path(path)};
  if (!file.is_open()) return false;
  std::string content((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
  return content.find("\"locked\":true") != std::string::npos || content.find("\"locked\": true") != std::string::npos;
}

void refreshCommandState() {
  ULONGLONG now = GetTickCount64();
  if (now - g_lastReadTick < 250) return;
  g_lastReadTick = now;

  std::wstring path = commandFilePath();
  if (path.empty()) return;
  g_truckLocked = fileContainsLockedTrue(path);
}

bool g_sentThisFrame = false;

// Input Callback: called by the game to fetch inputs from our virtual device
SCSAPI_RESULT input_event_callback(scs_input_event_t *const event_info, const scs_u32_t flags, const scs_context_t context) {
  if (flags & SCS_INPUT_EVENT_CALLBACK_FLAG_first_in_frame) {
    refreshCommandState();
    g_sentThisFrame = false;
  }

  if (!g_truckLocked) {
    return SCS_RESULT_not_found; // No event to emit
  }

  if (!g_sentThisFrame) {
    event_info->input_index = 0; // index of our brake input
    event_info->value_float.value = 1.0f; // 100% force
    g_sentThisFrame = true;
    return SCS_RESULT_ok;
  }

  return SCS_RESULT_not_found;
}

SCSAPI_VOID input_active_callback(const scs_u8_t active, const scs_context_t context) {
  g_deviceActive = (active != 0);
}

} // namespace

// Registration entrypoint for Telemetry (kept empty to not conflict if only used for input)
SCSAPI_RESULT scs_telemetry_init(const scs_u32_t version, const scs_telemetry_init_params_t *const params) {
  return SCS_RESULT_ok;
}
SCSAPI_VOID scs_telemetry_shutdown(void) {}

// Registration entrypoint for Input
SCSAPI_RESULT scs_input_init(const scs_u32_t version, const scs_input_init_params_t *const params) {
  if (version != SCS_INPUT_VERSION_1_00) return SCS_RESULT_unsupported;

  const scs_input_init_params_v100_t *const p = (const scs_input_init_params_v100_t *)params;

  // Define our virtual brake input
  static scs_input_device_input_t device_inputs[] = {
    { "freight_brake", "Freight Lock Brake", SCS_VALUE_TYPE_float }
  };

  static scs_input_device_t device_info;
  memset(&device_info, 0, sizeof(device_info));
  device_info.name = "freight_lock";
  device_info.display_name = "ETS2 Freight Lock System";
  device_info.type = SCS_INPUT_DEVICE_TYPE_semantical;
  device_info.input_count = 1;
  device_info.inputs = device_inputs;
  device_info.input_active_callback = input_active_callback;
  device_info.input_event_callback = input_event_callback;

  SCSAPI_RESULT res = p->register_device(&device_info);
  return res;
}

SCSAPI_VOID scs_input_shutdown(void) {
}

BOOL APIENTRY DllMain(HMODULE, DWORD reason, LPVOID) {
  if (reason == DLL_PROCESS_ATTACH) {
    g_truckLocked = false;
    g_lastReadTick = 0;
  }
  return TRUE;
}
