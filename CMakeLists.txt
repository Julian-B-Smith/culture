# Culture — C++ build. Command Line Tools only: configure with
#   cmake -S . -B build -G "Unix Makefiles" -DCMAKE_BUILD_TYPE=Release
# Unix Makefiles is single-config, so Debug and Release need separate build
# dirs. ./verify builds Release into build/ (parity AND perf are judged there).
cmake_minimum_required(VERSION 3.20)
project(culture LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

add_compile_options(-Wall -Wextra)

add_library(culture core/src/core.cpp)
target_include_directories(culture PUBLIC core/include)
# Parity guard, attached to the TARGET so any consumer that adds this library
# gets it (a directory-wide option would not follow core.cpp into a viewer or
# audio build). Contraction (fused multiply-add) and fast-math reassociation
# change double rounding; V8's JS arithmetic does neither, and clang contracts
# a*b+c by default on arm64. The FMAs V8's C++ libm DOES use (fdlibm sin/cos)
# are written out explicitly in core/src/fdlibm.hpp.
target_compile_options(culture PRIVATE -ffp-contract=off -fno-fast-math)

# core_ref: the frozen naive core every optimized core must match (D-030).
add_library(culture_ref core/ref/core_ref.cpp)
target_link_libraries(culture_ref PUBLIC culture)
target_compile_options(culture_ref PRIVATE -ffp-contract=off -fno-fast-math)

add_executable(culture_trace trace/main.cpp)
target_link_libraries(culture_trace PRIVATE culture_ref)  # brings culture too

add_executable(culture_vectors tests/vectors.cpp)
target_link_libraries(culture_vectors PRIVATE culture)
# vectors.cpp includes core/src/fdlibm.hpp directly and needs the same guard.
target_include_directories(culture_vectors PRIVATE core/src)
target_compile_options(culture_vectors PRIVATE -ffp-contract=off -fno-fast-math)

add_executable(culture_properties tests/properties.cpp)
target_link_libraries(culture_properties PRIVATE culture)
# P4 evidence: how often each SPEC §8 quirk fires, and how screened rules
# behave. Observes the World read-only; not part of ./verify.
add_executable(culture_quirks analysis/quirks.cpp)
target_link_libraries(culture_quirks PRIVATE culture)
