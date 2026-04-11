Forked from https://github.com/damonkohler/home-assistant-beurer-cosynight

# Unofficial Beurer CosyNight Home Assistant Integration

Minimal Home Assistant integration for Beurer CosyNight heated matress cover.

## Features

- Add Beurer CosyNight devices via Home Assistant UI
- Control body and feet zone settings (0-9 intensity levels)

## Installation

1. Add this repository to HACS
2. Install the integration
3. Go to **Settings → Devices & Services → Create Integration**
4. Search for "Beurer CosyNight"
5. Enter your Beurer CosyNight account credentials
6. Select zones to add as Home Assistant entities

## Configuration

Setup is done entirely through the Home Assistant GUI. No YAML configuration is required.

## Dashboard Card (Lovelace)

A visual card example is included in [beurer-card-example.yaml](beurer-card-example.yaml).

It provides:

- 2x2 heated-zone layout similar to the app/screenshot style
- Current level display for each zone (0-9)
- Multiple ways to change levels:
	- +/- buttons for quick level stepping
	- Per-zone dropdown selector for direct level selection
	- Optional timer selector, timer readout, and stop button

### Requirements

- No extra Lovelace cards required

### Setup

1. Restart Home Assistant after installing/updating the integration.
2. Add a **Manual** card and paste [beurer-card-example.yaml](beurer-card-example.yaml).
3. Replace the example entity IDs (for example `select.left_side_body_zone`) with your actual entities.
4. If you only have one side/device, remove the right-side zones.

The card type is `custom:beurer-cosynight-card` and is served by the integration at `/beurer_cosynight/beurer-cosynight-card.js`.

You can find your entities under **Settings -> Devices & Services -> Beurer CosyNight**.

## Credits

Based on https://github.com/damonkohler/home-assistant-beurer-cosynight
