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

A visual card is bundled with the integration as `custom:beurer-cosynight-card`.

It provides:

- 2x2 heated-zone layout similar to the app/screenshot style
- Current level display for each zone (0-9)
- Multiple ways to change levels:
	- +/- buttons for quick level stepping
	- Per-zone dropdown selector for direct level selection
	- Optional timer selector, timer readout, and stop button
- **GUI configuration** — configure zones and timer entities via the visual dashboard editor

### Requirements

- No extra Lovelace cards required

### Setup

1. **Restart Home Assistant** after installing/updating the integration (to load the bundled card).

2. Add the card resource to your Lovelace resources:
   - Go to **Settings → Dashboards → Resources**
   - Click **Create Resource**
   - URL: `/beurer_cosynight/beurer-cosynight-card.js`
   - Resource type: `JavaScript Module`
   - Click **Create**

3. Create a new card:
   - Add a **Manual** card to your dashboard (or use the **Create card** button)
   - Type: `custom:beurer-cosynight-card`
   - Click on the card to open the **visual editor** and configure:
     - Card title
     - Zone names & entity IDs
     - Timer selector and stop button (optional)

4. Alternatively, paste this YAML config and replace entity IDs:

```yaml
type: custom:beurer-cosynight-card
title: Beurer CosyNight
zones:
  - name: Left Body
    entity: select.left_side_body_zone
    tone: body
  - name: Right Body
    entity: select.right_side_body_zone
    tone: body
  - name: Left Feet
    entity: select.left_side_feet_zone
    tone: feet_left
  - name: Right Feet
    entity: select.right_side_feet_zone
    tone: feet_right
timer_select_entity: select.left_side_timer
timer_sensor_entity: sensor.left_side_timer
stop_button_entity: button.left_side_stop
```

Find your entities under **Settings → Devices & Services → Beurer CosyNight**.

## Credits

Based on https://github.com/damonkohler/home-assistant-beurer-cosynight
