PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS fan_status (
    fan_id TEXT PRIMARY KEY,
    fan_status INTEGER NOT NULL CHECK (status IN (0, 1)),
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS light_status (
    light_id TEXT PRIMARY KEY,
    light_status INTEGER NOT NULL CHECK (status IN (0, 1)),
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ac_status (
    ac_id TEXT PRIMARY KEY,
    ac_status INTEGER NOT NULL CHECK (status IN (0, 1)),
    temperature REAL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS esp32_details (
    esp32_id TEXT PRIMARY KEY,
    esp32_ip TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS device_mapping (
    esp32_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    PRIMARY KEY (esp32_id, device_id),
    FOREIGN KEY (esp32_id) REFERENCES esp32_details(esp32_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_device_mapping_esp32
ON device_mapping (esp32_id);

CREATE INDEX IF NOT EXISTS idx_device_mapping_device
ON device_mapping (device_id);
