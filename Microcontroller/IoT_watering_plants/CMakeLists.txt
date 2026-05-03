# Generated Cmake Pico project file

cmake_minimum_required(VERSION 3.13)

set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Initialise pico_sdk from installed location
# (note this can come from environment, CMake cache etc)

# == DO NOT EDIT THE FOLLOWING LINES for the Raspberry Pi Pico VS Code Extension to work ==
if(WIN32)
    set(USERHOME $ENV{USERPROFILE})
else()
    set(USERHOME $ENV{HOME})
endif()
set(sdkVersion 2.2.0)
set(toolchainVersion 14_2_Rel1)
set(picotoolVersion 2.2.0-a4)
set(picoVscode ${USERHOME}/.pico-sdk/cmake/pico-vscode.cmake)
if (EXISTS ${picoVscode})
    include(${picoVscode})
endif()
# ====================================================================================
set(PICO_BOARD pico CACHE STRING "Board type")

# Pull in Raspberry Pi Pico SDK (must be before project)
include(pico_sdk_import.cmake)

project(IoT_watering_plants C CXX ASM)

# Initialise the Raspberry Pi Pico SDK
pico_sdk_init()

# Add executable. Default name is the project name, version 0.1

add_executable(IoT_watering_plants IoT_watering_plants.cpp )

pico_set_program_name(IoT_watering_plants "IoT_watering_plants")
pico_set_program_version(IoT_watering_plants "0.1")

# Modify the below lines to enable/disable output over UART/USB
pico_enable_stdio_uart(IoT_watering_plants 0)
pico_enable_stdio_usb(IoT_watering_plants 0)

# Add the standard library to the build
target_link_libraries(IoT_watering_plants
    pico_stdlib
    hardware_i2c
    pico_i2c_slave
    hardware_gpio
    hardware_adc
)

pico_enable_stdio_usb(IoT_watering_plants 1)
pico_enable_stdio_uart(IoT_watering_plants 0)

# Add the standard include files to the build
target_include_directories(IoT_watering_plants PRIVATE
        ${CMAKE_CURRENT_LIST_DIR}
)

pico_add_extra_outputs(IoT_watering_plants)

