cmake_minimum_required(VERSION 3.20)
project(ets2_freight_plugin LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(ets2_freight_plugin SHARED
  src/ets2_freight_plugin.cpp
)

target_include_directories(ets2_freight_plugin PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/vendor/scs-sdk/include
)

target_compile_definitions(ets2_freight_plugin PRIVATE
  WIN32_LEAN_AND_MEAN
  NOMINMAX
)
