{
  "targets": [
    {
      "target_name": "windows_media_control",
      "sources": ["src/addon.cpp", "src/windows-media-control.cpp"],
      "defines": ["_WIN32_WINNT=0x0A00", "WIN32_LEAN_AND_MEAN", "NOMINMAX"],
      "libraries": ["windowsapp.lib"],
      "msvs_settings": {
        "VCCLCompilerTool": {
          "AdditionalOptions": ["/std:c++17"],
          "ExceptionHandling": 1
        }
      }
    }
  ]
}
