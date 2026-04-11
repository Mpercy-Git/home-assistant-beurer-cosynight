class BeurerCosyNightCard extends HTMLElement {
  setConfig(config) {
    this._config = config || {};

    const zones = this._getZones();
    if (!zones.length) {
      throw new Error("At least one zone entity is required");
    }
  }

  set hass(hass) {
    this._hass = hass;

    if (!this._root) {
      this._root = this.attachShadow({ mode: "open" });
    }

    this._render();
  }

  getCardSize() {
    return 8;
  }

  _getZones() {
    if (Array.isArray(this._config.zones) && this._config.zones.length) {
      return this._config.zones.map((zone) => ({
        ...zone,
        colour_style: this._normaliseColourStyle(zone),
      }));
    }

    const fallback = [
      { name: "Left Body", entity: this._config.left_body_entity, colour_style: "body" },
      { name: "Right Body", entity: this._config.right_body_entity, colour_style: "body" },
      { name: "Left Feet", entity: this._config.left_feet_entity, colour_style: "feet" },
      { name: "Right Feet", entity: this._config.right_feet_entity, colour_style: "feet" },
    ];

    return fallback.filter((z) => z.entity);
  }

  _normaliseColourStyle(zone) {
    const raw = String(zone.colour_style || zone.tone || "body");
    if (raw === "feet_left" || raw === "feet_right") {
      return "feet";
    }
    return raw === "feet" ? "feet" : "body";
  }

  _colourStyleBase(colourStyle) {
    if (colourStyle === "feet") {
      return [255, 189, 64];
    }
    return [255, 193, 102];
  }

  _zoneHeatAlpha(state) {
    const value = Number.parseInt(state, 10);
    if (Number.isNaN(value)) {
      return 0.12;
    }
    return Math.max(0.12, Math.min(0.85, 0.12 + value * 0.08));
  }

  _render() {
    if (!this._hass || !this._config) {
      return;
    }

    const zones = this._getZones();
    const title = this._config.title || "Beurer CosyNight";

    const zoneMarkup = zones
      .map((zone) => {
        const stateObj = this._hass.states[zone.entity];
        const level = stateObj ? stateObj.state : "unknown";
        const alpha = this._zoneHeatAlpha(level);
        const base = this._colourStyleBase(zone.colour_style);
        const gradient = `linear-gradient(180deg, rgba(${base[0]}, ${base[1] + 36}, ${base[2] + 48}, ${alpha}) 0%, rgba(${base[0]}, ${base[1]}, ${base[2]}, ${alpha}) 100%)`;

        const options = (stateObj && stateObj.attributes && stateObj.attributes.options) || [];
        const optionsMarkup = options
          .map((opt) => {
            const selected = String(opt) === String(level) ? " selected" : "";
            return `<option value="${String(opt)}"${selected}>${String(opt)}</option>`;
          })
          .join("");

        return `
          <div class="zone" style="background:${gradient};">
            <div class="zone-title">${zone.name || zone.entity}</div>
            <div class="zone-level">Level: ${level}</div>
            <div class="zone-controls">
              <button class="step" data-action="down" data-entity="${zone.entity}" aria-label="Decrease">-</button>
              <select class="pick" data-entity="${zone.entity}">
                ${optionsMarkup}
              </select>
              <button class="step" data-action="up" data-entity="${zone.entity}" aria-label="Increase">+</button>
            </div>
          </div>
        `;
      })
      .join("");

    const timerSelectEntity = this._config.timer_select_entity;
    const timerSensorEntity = this._config.timer_sensor_entity;
    const stopButtonEntity = this._config.stop_button_entity;

    const timerSelectState = timerSelectEntity ? this._hass.states[timerSelectEntity] : undefined;
    const timerCurrent = timerSelectState ? timerSelectState.state : "";
    const timerOptions = (timerSelectState && timerSelectState.attributes && timerSelectState.attributes.options) || [];
    const timerOptionsMarkup = timerOptions
      .map((opt) => {
        const selected = String(opt) === String(timerCurrent) ? " selected" : "";
        return `<option value="${String(opt)}"${selected}>${String(opt)}</option>`;
      })
      .join("");

    const timerRemaining = timerSensorEntity && this._hass.states[timerSensorEntity]
      ? this._hass.states[timerSensorEntity].state
      : "";

    const footer = (timerSelectEntity || timerSensorEntity || stopButtonEntity)
      ? `
        <div class="footer">
          ${timerSelectEntity ? `<label>Timer: <select class="timer-pick" data-entity="${timerSelectEntity}">${timerOptionsMarkup}</select></label>` : ""}
          ${timerSensorEntity ? `<div class="timer-readout">Remaining: ${timerRemaining}</div>` : ""}
          ${stopButtonEntity ? `<button class="stop" data-entity="${stopButtonEntity}">Stop</button>` : ""}
        </div>
      `
      : "";

    this._root.innerHTML = `
      <ha-card>
        <div class="wrap">
          <div class="title">${title}</div>
          <div class="grid">${zoneMarkup}</div>
          ${footer}
        </div>
      </ha-card>
      <style>
        .wrap {
          padding: 14px;
        }

        .title {
          font-size: 1.2rem;
          font-weight: 700;
          margin-bottom: 10px;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .zone {
          border: 2px solid #f2c57b;
          border-radius: 14px;
          padding: 12px;
          min-height: 132px;
          box-sizing: border-box;
        }

        .zone-title {
          font-weight: 700;
          margin-bottom: 6px;
        }

        .zone-level {
          font-size: 0.98rem;
          margin-bottom: 10px;
        }

        .zone-controls {
          display: grid;
          grid-template-columns: 36px 1fr 36px;
          gap: 6px;
          align-items: center;
        }

        .step,
        .pick,
        .timer-pick,
        .stop {
          border-radius: 8px;
          border: 1px solid rgba(0, 0, 0, 0.2);
          background: rgba(255, 255, 255, 0.85);
          padding: 6px;
          font-size: 0.95rem;
        }

        .step {
          font-weight: 700;
        }

        .footer {
          margin-top: 12px;
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }

        .timer-readout {
          font-weight: 600;
        }

        @media (max-width: 680px) {
          .grid {
            grid-template-columns: 1fr;
          }
        }
      </style>
    `;

    this._root.querySelectorAll("button.step").forEach((button) => {
      button.addEventListener("click", (ev) => {
        const entity = ev.currentTarget.getAttribute("data-entity");
        const action = ev.currentTarget.getAttribute("data-action");
        this._stepLevel(entity, action === "up" ? 1 : -1);
      });
    });

    this._root.querySelectorAll("select.pick").forEach((select) => {
      select.addEventListener("change", (ev) => {
        const entity = ev.currentTarget.getAttribute("data-entity");
        const value = ev.currentTarget.value;
        this._selectOption(entity, value);
      });
    });

    const timerPick = this._root.querySelector("select.timer-pick");
    if (timerPick) {
      timerPick.addEventListener("change", (ev) => {
        const entity = ev.currentTarget.getAttribute("data-entity");
        this._selectOption(entity, ev.currentTarget.value);
      });
    }

    const stop = this._root.querySelector("button.stop");
    if (stop) {
      stop.addEventListener("click", (ev) => {
        const entity = ev.currentTarget.getAttribute("data-entity");
        this._hass.callService("button", "press", { entity_id: entity });
      });
    }
  }

  _stepLevel(entityId, delta) {
    const stateObj = this._hass.states[entityId];
    if (!stateObj || !stateObj.attributes || !Array.isArray(stateObj.attributes.options)) {
      return;
    }

    const options = stateObj.attributes.options.map((o) => String(o));
    const currentIndex = options.indexOf(String(stateObj.state));
    if (currentIndex === -1) {
      return;
    }

    const nextIndex = Math.min(options.length - 1, Math.max(0, currentIndex + delta));
    this._selectOption(entityId, options[nextIndex]);
  }

  _selectOption(entityId, option) {
    this._hass.callService("select", "select_option", {
      entity_id: entityId,
      option: String(option),
    });
  }

  static getConfigElement() {
    return document.createElement("beurer-cosynight-card-editor");
  }

  static getStubConfig() {
    return {
      title: "Beurer CosyNight",
      zones: [
        { name: "Left Body", entity: "", colour_style: "body" },
        { name: "Right Body", entity: "", colour_style: "body" },
        { name: "Left Feet", entity: "", colour_style: "feet" },
        { name: "Right Feet", entity: "", colour_style: "feet" },
      ],
    };
  }
}

if (!customElements.get("beurer-cosynight-card")) {
  customElements.define("beurer-cosynight-card", BeurerCosyNightCard);
}

class BeurerCosyNightCardEditor extends HTMLElement {
  set hass(hass) {
    this._hass = hass;
  }

  setHass(hass) {
    this.hass = hass;
  }

  setConfig(config) {
    this._config = config || {};
    this._render();
  }

  get _title() {
    return this._config.title || "Beurer CosyNight";
  }

  get _zones() {
    return this._config.zones || [];
  }

  get _timerSelectEntity() {
    return this._config.timer_select_entity || "";
  }

  get _timerSensorEntity() {
    return this._config.timer_sensor_entity || "";
  }

  get _stopButtonEntity() {
    return this._config.stop_button_entity || "";
  }

  _render() {
    this.innerHTML = `
      <div style="padding: 16px;">
        <div style="margin-bottom: 16px;">
          <label>
            Card Title:
            <input type="text" id="title" value="${this._title}" 
              style="width: 200px; padding: 6px; margin-left: 8px;">
          </label>
        </div>

        <div style="margin-bottom: 16px;">
          <h3>Zones</h3>
          <div id="zones-container"></div>
          <button id="add-zone" style="margin-top: 8px; padding: 6px 12px;">+ Add Zone</button>
        </div>

        <div style="margin-bottom: 16px;">
          <label>
            Timer Select Entity:
            <input type="text" id="timer_select_entity" value="${this._timerSelectEntity}" 
              style="width: 250px; padding: 6px; margin-left: 8px;" placeholder="select.timer">
          </label>
        </div>

        <div style="margin-bottom: 16px;">
          <label>
            Timer Sensor Entity:
            <input type="text" id="timer_sensor_entity" value="${this._timerSensorEntity}" 
              style="width: 250px; padding: 6px; margin-left: 8px;" placeholder="sensor.timer">
          </label>
        </div>

        <div style="margin-bottom: 16px;">
          <label>
            Stop Button Entity:
            <input type="text" id="stop_button_entity" value="${this._stopButtonEntity}" 
              style="width: 250px; padding: 6px; margin-left: 8px;" placeholder="button.stop">
          </label>
        </div>
      </div>
    `;

    const titleInput = this.querySelector("#title");
    titleInput.addEventListener("change", () => this._updateConfig());

    const timerSelectInput = this.querySelector("#timer_select_entity");
    timerSelectInput.addEventListener("change", () => this._updateConfig());

    const timerSensorInput = this.querySelector("#timer_sensor_entity");
    timerSensorInput.addEventListener("change", () => this._updateConfig());

    const stopButtonInput = this.querySelector("#stop_button_entity");
    stopButtonInput.addEventListener("change", () => this._updateConfig());

    const addZoneBtn = this.querySelector("#add-zone");
    addZoneBtn.addEventListener("click", () => this._addZone());

    this._renderZones();
  }

  _renderZones() {
    const container = this.querySelector("#zones-container");
    container.innerHTML = this._zones
      .map((zone, idx) => {
        const styles = ["body", "feet"];
        const styleOptions = styles
          .map((style) => {
            const selected = this._normaliseColourStyle(zone) === style ? " selected" : "";
            return `<option value="${style}"${selected}>${style}</option>`;
          })
          .join("");

        return `
          <div style="margin-bottom: 12px; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
            <div>
              <label>Name: <input type="text" class="zone-name" data-idx="${idx}" value="${zone.name || ""}" style="width: 150px; padding: 4px; margin: 0 8px;"></label>
            </div>
            <div>
              <label>Entity: <input type="text" class="zone-entity" data-idx="${idx}" value="${zone.entity || ""}" style="width: 200px; padding: 4px; margin: 0 8px;" placeholder="select.zone"></label>
            </div>
            <div>
              <label>Colour Style: <select class="zone-colour-style" data-idx="${idx}" style="padding: 4px; margin: 0 8px;">${styleOptions}</select></label>
              <button class="remove-zone" data-idx="${idx}" style="padding: 4px 8px; margin-left: 8px;">Remove</button>
            </div>
          </div>
        `;
      })
      .join("");

    this.querySelectorAll(".zone-name, .zone-entity, .zone-colour-style").forEach((input) => {
      input.addEventListener("change", () => this._updateConfig());
    });

    this.querySelectorAll(".remove-zone").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const idx = parseInt(e.currentTarget.getAttribute("data-idx"), 10);
        this._removeZone(idx);
      });
    });
  }

  _addZone() {
    this._config.zones = this._config.zones || [];
    this._config.zones.push({ name: "New Zone", entity: "", colour_style: "body" });
    this._render();
    this._updateConfig();
  }

  _removeZone(idx) {
    this._config.zones.splice(idx, 1);
    this._render();
    this._updateConfig();
  }

  _updateConfig() {
    const title = this.querySelector("#title").value;
    const zones = this._zones.map((zone, idx) => ({
      name: this.querySelector(`.zone-name[data-idx="${idx}"]`)?.value || zone.name,
      entity: this.querySelector(`.zone-entity[data-idx="${idx}"]`)?.value || zone.entity,
      colour_style: this.querySelector(`.zone-colour-style[data-idx="${idx}"]`)?.value || this._normaliseColourStyle(zone),
    }));

    const nextConfig = {
      ...this._config,
      title,
      zones,
      timer_select_entity: this.querySelector("#timer_select_entity").value || undefined,
      timer_sensor_entity: this.querySelector("#timer_sensor_entity").value || undefined,
      stop_button_entity: this.querySelector("#stop_button_entity").value || undefined,
    };

    this._config = nextConfig;
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: nextConfig },
        bubbles: true,
        composed: true,
      })
    );
  }
}

if (!customElements.get("beurer-cosynight-card-editor")) {
  customElements.define("beurer-cosynight-card-editor", BeurerCosyNightCardEditor);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "beurer-cosynight-card")) {
  window.customCards.push({
    type: "beurer-cosynight-card",
    name: "Beurer CosyNight Card",
    description: "Control and view Beurer CosyNight heat zones and timer.",
    preview: false,
    configurable: true,
  });
}
