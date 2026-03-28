
// ─────────────────────────────────────────────────────────────
// PARAMETER COMPUTATION ENGINE
// ─────────────────────────────────────────────────────────────

function computeWind(v) {
    const turb = v.turbulance ?? 0;
    const thermalEnabled = v.thermalProfile ? 1 : 0;
    return {
        SIM_WIND_SPD: +(v.speed ?? 0).toFixed(2),
        SIM_WIND_DIR: +(v.direction ?? 0).toFixed(1),
        SIM_WIND_DIR_Z: +(v.verticalSpeed ?? 0).toFixed(2),
        SIM_WIND_TURB: +(turb * 0.5).toFixed(3),
        SIM_WIND_TC: turb > 0.3 ? 0.1 : 2.0,
        SIM_WIND_T: thermalEnabled,
        SIM_WIND_T_ALT: +(v.thermalAlt ?? 100).toFixed(0),
        SIM_WIND_T_COEF: +(v.thermalCoef ?? 0.01).toFixed(4),
    };
}

function computeGPS(v) {
    const preset = v.quality ?? "good";
    const presets = {
        perfect: { noise: 0.0, sats: 16, acc: 1.0, jam: 0, bytelos: 0 },
        good: { noise: 0.2, sats: 12, acc: 2.0, jam: 0, bytelos: 0 },
        medium: { noise: 1.5, sats: 8, acc: 5.0, jam: 0, bytelos: 5 },
        bad: { noise: 4.0, sats: 4, acc: 15.0, jam: 0, bytelos: 20 },
        jammed: { noise: 5.0, sats: 0, acc: 99.0, jam: 1, bytelos: 80 },
        none: { noise: 0, sats: 0, acc: 0, jam: 0, bytelos: 0 },
    };
    const p = presets[preset] || presets.good;
    const lcktime = preset === "bad" ? 10 : preset === "jammed" ? 60 : 0;
    const en = preset === "none" ? 0 : 1;
    return {
        SIM_GPS1_ENABLE: en,
        SIM_GPS1_NOISE: +p.noise.toFixed(2),
        SIM_GPS1_NUMSATS: p.sats,
        SIM_GPS1_ACC: +p.acc.toFixed(1),
        SIM_GPS1_JAM: p.jam,
        SIM_GPS1_BYTELOS: p.bytelos,
        SIM_GPS1_LCKTIME: lcktime,
        SIM_GPS1_GLTCH_X: +(v.glitchX ?? 0).toFixed(4),
        SIM_GPS1_GLTCH_Y: +(v.glitchY ?? 0).toFixed(4),
        SIM_GPS1_GLTCH_Z: +(v.glitchZ ?? 0).toFixed(4),
        SIM_GPS1_LAG_MS: v.lagMs ?? 200,
        SIM_GPS2_ENABLE: v.dualGPS ? 1 : 0,
    };
}

function computeBaro(v) {
    const level = v.noiseLevel ?? 0;
    const rnd = +(level * 3.0).toFixed(2);
    return {
        SIM_BARO_DISABLE: v.disabled ? 1 : 0,
        SIM_BARO_FREEZE: v.frozen ? 1 : 0,
        SIM_BARO_RND: rnd,
        SIM_BARO_DRIFT: +(level * 0.02).toFixed(4),
        SIM_BARO_DELAY: v.delayMs ?? 0,
        SIM_BARO_GLITCH: +(v.glitch ?? 0).toFixed(1),
        SIM_BAR2_DISABLE: v.disableBaro2 ? 1 : 0,
        SIM_BAR2_RND: rnd,
        SIM_BAR3_DISABLE: v.disableBaro3 ? 1 : 0,
        SIM_BAR3_RND: rnd,
    };
}

function computeIMU(v) {
    const vib = v.vibrationLevel ?? 0; // 0-1
    const motMax = +(vib * 200).toFixed(1);
    const freqBase = vib > 0 ? Math.round(80 + vib * 120) : 0;
    const noise = +(vib * 0.05).toFixed(4);
    const gyroRnd = +(vib * 0.02).toFixed(4);
    const biasX = +(v.gyroBiasX ?? 0).toFixed(4);
    const biasY = +(v.gyroBiasY ?? 0).toFixed(4);
    const biasZ = +(v.gyroBiasZ ?? 0).toFixed(4);
    const abiasX = +(v.accBiasX ?? 0).toFixed(4);
    const abiasY = +(v.accBiasY ?? 0).toFixed(4);
    const abiasZ = +(v.accBiasZ ?? 0).toFixed(4);
    const hmnc = vib > 0.5 ? 1 : 0;
    return {
        SIM_VIB_MOT_MAX: motMax,
        SIM_VIB_MOT_MULT: +(vib * 0.2).toFixed(2),
        SIM_VIB_MOT_HMNC: hmnc,
        SIM_VIB_MOT_MASK: vib > 0 ? 15 : 0,
        SIM_VIB_FREQ_X: freqBase > 0 ? freqBase : 0,
        SIM_VIB_FREQ_Y: freqBase > 0 ? freqBase + 5 : 0,
        SIM_VIB_FREQ_Z: freqBase > 0 ? freqBase + 10 : 0,
        SIM_ACC1_RND: noise, SIM_ACC2_RND: noise, SIM_ACC3_RND: noise,
        SIM_GYR1_RND: gyroRnd, SIM_GYR2_RND: gyroRnd, SIM_GYR3_RND: gyroRnd,
        SIM_GYR1_BIAS_X: biasX, SIM_GYR1_BIAS_Y: biasY, SIM_GYR1_BIAS_Z: biasZ,
        SIM_GYR2_BIAS_X: biasX, SIM_GYR2_BIAS_Y: biasY, SIM_GYR2_BIAS_Z: biasZ,
        SIM_GYR3_BIAS_X: biasX, SIM_GYR3_BIAS_Y: biasY, SIM_GYR3_BIAS_Z: biasZ,
        SIM_ACC1_BIAS_X: abiasX, SIM_ACC1_BIAS_Y: abiasY, SIM_ACC1_BIAS_Z: abiasZ,
        SIM_ACC2_BIAS_X: abiasX, SIM_ACC2_BIAS_Y: abiasY, SIM_ACC2_BIAS_Z: abiasZ,
        SIM_ACC3_BIAS_X: abiasX, SIM_ACC3_BIAS_Y: abiasY, SIM_ACC3_BIAS_Z: abiasZ,
    };
}

function computeMag(v) {
    const noise = +(v.noiseLevel ?? 0).toFixed(2);
    const ofsX = +(v.offsetX ?? 0).toFixed(1);
    const ofsY = +(v.offsetY ?? 0).toFixed(1);
    const ofsZ = +(v.offsetZ ?? 0).toFixed(1);
    const fail1 = v.failMag1 ? 1 : 0;
    const fail2 = v.failMag2 ? 1 : 0;
    const fail3 = v.failMag3 ? 1 : 0;
    return {
        SIM_MAG_RND: noise,
        SIM_MAG1_OFS_X: ofsX, SIM_MAG1_OFS_Y: ofsY, SIM_MAG1_OFS_Z: ofsZ,
        SIM_MAG2_OFS_X: ofsX, SIM_MAG2_OFS_Y: ofsY, SIM_MAG2_OFS_Z: ofsZ,
        SIM_MAG3_OFS_X: ofsX, SIM_MAG3_OFS_Y: ofsY, SIM_MAG3_OFS_Z: ofsZ,
        SIM_MAG1_FAIL: fail1,
        SIM_MAG2_FAIL: fail2,
        SIM_MAG3_FAIL: fail3,
        SIM_MAG_DELAY: v.delayMs ?? 0,
        SIM_MAG1_SCALING: +(v.scaling ?? 1.0).toFixed(2),
    };
}

function computeTemp(v) {
    const temp = v.temperature ?? 25;
    return {
        SIM_TEMP_START: +temp.toFixed(1),
        SIM_TEMP_BRD_OFF: +(v.boardOffset ?? 5).toFixed(1),
        SIM_TEMP_BFACTOR: +(v.bfactor ?? 0).toFixed(4),
        SIM_TEMP_TCONST: +(v.timeConst ?? 30).toFixed(1),
    };
}

function computeBattery(v) {
    return {
        SIM_BATT_VOLTAGE: +(v.voltage ?? 12.6).toFixed(2),
        SIM_BATT_CAP_AH: +(v.capacityAh ?? 4.0).toFixed(1),
    };
}

function computeEngine(v) {
    const power = v.powerPercent ?? 100;
    const fail = v.fail ? 1 : 0;
    return {
        SIM_ENGINE_FAIL: fail,
        SIM_ENGINE_MUL: fail ? 0 : +(power / 100).toFixed(2),
        SIM_ESC_ARM_RPM: v.armRpm ?? 10,
        SIM_ESC_TELEM: v.escTelem ? 1 : 0,
    };
}

function computeWave(v) {
    const en = v.enabled ? 1 : 0;
    return {
        SIM_WAVE_ENABLE: en,
        SIM_WAVE_AMP: +(v.amplitude ?? 0).toFixed(2),
        SIM_WAVE_LENGTH: +(v.wavelength ?? 10).toFixed(1),
        SIM_WAVE_SPEED: +(v.speed ?? 0.5).toFixed(2),
        SIM_WAVE_DIR: +(v.direction ?? 0).toFixed(1),
        SIM_TIDE_SPEED: +(v.tideSpeed ?? 0).toFixed(2),
        SIM_TIDE_DIR: +(v.tideDir ?? 0).toFixed(1),
    };
}

function computeAirspeed(v) {
    return {
        SIM_ARSPD_FAIL: v.fail ? 1 : 0,
        SIM_ARSPD_FAILP: v.failProbability ?? 0,
        SIM_ARSPD_RND: +(v.noise ?? 0).toFixed(2),
        SIM_ARSPD_OFS: +(v.offset ?? 0).toFixed(1),
        SIM_ARSPD_RATIO: +(v.ratio ?? 2.0).toFixed(2),
        SIM_ARSPD_SIGN: v.negSign ? -1 : 1,
        SIM_ARSPD2_FAIL: v.fail2 ? 1 : 0,
        SIM_ARSPD2_RND: +(v.noise ?? 0).toFixed(2),
    };
}

function computeADSB(v) {
    return {
        SIM_ADSB_COUNT: v.count ?? 0,
        SIM_ADSB_RADIUS: +(v.radius ?? 1000).toFixed(0),
        SIM_ADSB_ALT: +(v.altitude ?? 100).toFixed(0),
        SIM_ADSB_TX: v.tx ? 1 : 0,
    };
}

function computeShove(v) {
    return {
        SIM_SHOVE_X: +(v.x ?? 0).toFixed(2),
        SIM_SHOVE_Y: +(v.y ?? 0).toFixed(2),
        SIM_SHOVE_Z: +(v.z ?? 0).toFixed(2),
        SIM_SHOVE_TIME: v.duration ?? 0,
    };
}

function computeSensorFail(v) {
    const accMask = (v.failAcc1 ? 1 : 0) | (v.failAcc2 ? 2 : 0) | (v.failAcc3 ? 4 : 0);
    const gyrMask = (v.failGyr1 ? 1 : 0) | (v.failGyr2 ? 2 : 0) | (v.failGyr3 ? 4 : 0);
    return {
        SIM_ACCEL1_FAIL: v.failAcc1 ? 1 : 0,
        SIM_ACCEL2_FAIL: v.failAcc2 ? 1 : 0,
        SIM_ACCEL3_FAIL: v.failAcc3 ? 1 : 0,
        SIM_ACC_FAIL_MSK: accMask,
        SIM_GYR_FAIL_MSK: gyrMask,
    };
}

function computeOpticalFlow(v) {
    return {
        SIM_FLOW_ENABLE: v.enabled ? 1 : 0,
        SIM_FLOW_RATE: v.rate ?? 10,
        SIM_FLOW_RND: +(v.noise ?? 0).toFixed(2),
        SIM_FLOW_POS_X: +(v.posX ?? 0).toFixed(2),
        SIM_FLOW_POS_Y: +(v.posY ?? 0).toFixed(2),
        SIM_FLOW_POS_Z: +(v.posZ ?? 0).toFixed(2),
        SIM_FLOW_DELAY: v.delay ?? 0,
    };
}

function computeSonar(v) {
    return {
        SIM_SONAR_RND: +(v.noise ?? 0).toFixed(3),
        SIM_SONAR_GLITCH: +(v.glitchProb ?? 0).toFixed(2),
        SIM_SONAR_SCALE: +(v.scale ?? 1.0).toFixed(2),
        SIM_SONAR_ROT: v.rotation ?? 0,
        SIM_SONAR_POS_X: +(v.posX ?? 0).toFixed(2),
        SIM_SONAR_POS_Y: +(v.posY ?? 0).toFixed(2),
        SIM_SONAR_POS_Z: +(v.posZ ?? 0).toFixed(2),
    };
}

function computeGeneral(v) {
    return {
        SIM_SPEEDUP: v.speedup ?? 1,
        SIM_TERRAIN: v.terrain ? 1 : 0,
        SIM_LOOP_DELAY: v.loopDelay ?? 0,
        SIM_RATE_HZ: v.rateHz ?? 1200,
        SIM_TIME_JITTER: +(v.timeJitter ?? 0).toFixed(1),
        SIM_UART_LOSS: v.uartLoss ?? 0,
    };
}

// ─────────────────────────────────────────────────────────────
// GROUP DEFINITIONS
// ─────────────────────────────────────────────────────────────

const SIM_GROUPS = [
    {
        id: "wind", label: "Rüzgar", icon: "🌬️",
        color: "#38bdf8",
        compute: computeWind,
        defaults: { speed: 0, direction: 0, verticalSpeed: 0, turbulance: 0, thermalProfile: false, thermalAlt: 100, thermalCoef: 0.01 },
        controls: [
            { key: "speed", label: "Hız (m/s)", type: "range", min: 0, max: 30, step: 0.5, unit: "m/s" },
            { key: "direction", label: "Yön (°)", type: "range", min: 0, max: 360, step: 1, unit: "°" },
            { key: "verticalSpeed", label: "Dikey Hız (m/s)", type: "range", min: -5, max: 5, step: 0.1, unit: "m/s" },
            { key: "turbulance", label: "Türbülans", type: "range", min: 0, max: 1, step: 0.01, unit: "" },
            { key: "thermalProfile", label: "Termal Profil", type: "toggle" },
            { key: "thermalAlt", label: "Termal Yükseklik (m)", type: "number", min: 0, max: 5000, step: 10 },
        ],
    },
    {
        id: "gps", label: "GPS Kalitesi", icon: "🛰️",
        color: "#a78bfa",
        compute: computeGPS,
        defaults: { quality: "good", glitchX: 0, glitchY: 0, glitchZ: 0, lagMs: 200, dualGPS: false },
        controls: [
            {
                key: "quality", label: "Kalite Seviyesi", type: "select",
                options: [
                    { value: "perfect", label: "Mükemmel" },
                    { value: "good", label: "İyi" },
                    { value: "medium", label: "Orta" },
                    { value: "bad", label: "Kötü" },
                    { value: "jammed", label: "Jamming (Engelleme)" },
                    { value: "none", label: "Kapalı" },
                ]
            },
            { key: "glitchX", label: "Glitch Enlem (°)", type: "range", min: -0.01, max: 0.01, step: 0.0001, unit: "°" },
            { key: "glitchY", label: "Glitch Boylam (°)", type: "range", min: -0.01, max: 0.01, step: 0.0001, unit: "°" },
            { key: "glitchZ", label: "Glitch Yükseklik (m)", type: "range", min: -10, max: 10, step: 0.1, unit: "m" },
            { key: "lagMs", label: "Gecikme (ms)", type: "range", min: 0, max: 1000, step: 10, unit: "ms" },
            { key: "dualGPS", label: "İkinci GPS Aktif", type: "toggle" },
        ],
    },
    {
        id: "baro", label: "Barometer", icon: "🌡️",
        color: "#fb923c",
        compute: computeBaro,
        defaults: { noiseLevel: 0, disabled: false, frozen: false, delayMs: 0, glitch: 0, disableBaro2: false, disableBaro3: false },
        controls: [
            { key: "noiseLevel", label: "Gürültü Seviyesi", type: "range", min: 0, max: 1, step: 0.01, unit: "" },
            { key: "glitch", label: "Glitch (Pa)", type: "range", min: 0, max: 100, step: 1, unit: "Pa" },
            { key: "delayMs", label: "Gecikme (ms)", type: "range", min: 0, max: 500, step: 10, unit: "ms" },
            { key: "disabled", label: "Baro 1 Devre Dışı", type: "toggle" },
            { key: "frozen", label: "Baro Dondur", type: "toggle" },
            { key: "disableBaro2", label: "Baro 2 Devre Dışı", type: "toggle" },
            { key: "disableBaro3", label: "Baro 3 Devre Dışı", type: "toggle" },
        ],
    },
    {
        id: "imu", label: "IMU / Titreşim", icon: "🔄",
        color: "#34d399",
        compute: computeIMU,
        defaults: { vibrationLevel: 0, gyroBiasX: 0, gyroBiasY: 0, gyroBiasZ: 0, accBiasX: 0, accBiasY: 0, accBiasZ: 0 },
        controls: [
            { key: "vibrationLevel", label: "Titreşim Seviyesi", type: "range", min: 0, max: 1, step: 0.01, unit: "" },
            { key: "gyroBiasX", label: "Gyro Bias X (rad/s)", type: "range", min: -0.1, max: 0.1, step: 0.001, unit: "rad/s" },
            { key: "gyroBiasY", label: "Gyro Bias Y (rad/s)", type: "range", min: -0.1, max: 0.1, step: 0.001, unit: "rad/s" },
            { key: "gyroBiasZ", label: "Gyro Bias Z (rad/s)", type: "range", min: -0.1, max: 0.1, step: 0.001, unit: "rad/s" },
            { key: "accBiasX", label: "İvme Bias X (m/s²)", type: "range", min: -1, max: 1, step: 0.01, unit: "m/s²" },
            { key: "accBiasY", label: "İvme Bias Y (m/s²)", type: "range", min: -1, max: 1, step: 0.01, unit: "m/s²" },
            { key: "accBiasZ", label: "İvme Bias Z (m/s²)", type: "range", min: -1, max: 1, step: 0.01, unit: "m/s²" },
        ],
    },
    {
        id: "mag", label: "Manyetometre", icon: "🧲",
        color: "#f472b6",
        compute: computeMag,
        defaults: { noiseLevel: 0, offsetX: 0, offsetY: 0, offsetZ: 0, failMag1: false, failMag2: false, failMag3: false, delayMs: 0, scaling: 1.0 },
        controls: [
            { key: "noiseLevel", label: "Gürültü (gauss)", type: "range", min: 0, max: 5, step: 0.1, unit: "gauss" },
            { key: "offsetX", label: "Offset X", type: "range", min: -200, max: 200, step: 1, unit: "" },
            { key: "offsetY", label: "Offset Y", type: "range", min: -200, max: 200, step: 1, unit: "" },
            { key: "offsetZ", label: "Offset Z", type: "range", min: -200, max: 200, step: 1, unit: "" },
            { key: "scaling", label: "Ölçek Faktörü", type: "range", min: 0.5, max: 2.0, step: 0.01, unit: "" },
            { key: "delayMs", label: "Gecikme (ms)", type: "range", min: 0, max: 500, step: 10, unit: "ms" },
            { key: "failMag1", label: "Mag 1 Arızalı", type: "toggle" },
            { key: "failMag2", label: "Mag 2 Arızalı", type: "toggle" },
            { key: "failMag3", label: "Mag 3 Arızalı", type: "toggle" },
        ],
    },
    {
        id: "temp", label: "Sıcaklık", icon: "🌡",
        color: "#fbbf24",
        compute: computeTemp,
        defaults: { temperature: 25, boardOffset: 5, bfactor: 0, timeConst: 30 },
        controls: [
            { key: "temperature", label: "Ortam Sıcaklığı (°C)", type: "range", min: -40, max: 85, step: 0.5, unit: "°C" },
            { key: "boardOffset", label: "Kart Offset (°C)", type: "range", min: 0, max: 30, step: 0.5, unit: "°C" },
            { key: "bfactor", label: "Bias Faktörü", type: "range", min: -0.1, max: 0.1, step: 0.001, unit: "" },
            { key: "timeConst", label: "Zaman Sabiti (s)", type: "range", min: 1, max: 300, step: 1, unit: "s" },
        ],
    },
    {
        id: "battery", label: "Batarya", icon: "🔋",
        color: "#4ade80",
        compute: computeBattery,
        defaults: { voltage: 12.6, capacityAh: 4.0 },
        controls: [
            { key: "voltage", label: "Voltaj (V)", type: "range", min: 6.0, max: 25.2, step: 0.1, unit: "V" },
            { key: "capacityAh", label: "Kapasite (Ah)", type: "range", min: 0.5, max: 30, step: 0.5, unit: "Ah" },
        ],
    },
    {
        id: "engine", label: "Motor / ESC", icon: "⚙️",
        color: "#f87171",
        compute: computeEngine,
        defaults: { fail: false, powerPercent: 100, armRpm: 10, escTelem: false },
        controls: [
            { key: "powerPercent", label: "Güç (%)", type: "range", min: 0, max: 100, step: 1, unit: "%" },
            { key: "armRpm", label: "Arm Eşiği (RPM)", type: "range", min: 0, max: 200, step: 5, unit: "RPM" },
            { key: "fail", label: "Motor Arızası", type: "toggle" },
            { key: "escTelem", label: "ESC Telemetri", type: "toggle" },
        ],
    },
    {
        id: "wave", label: "Dalga / Gel-git", icon: "🌊",
        color: "#22d3ee",
        compute: computeWave,
        defaults: { enabled: false, amplitude: 0, wavelength: 10, speed: 0.5, direction: 0, tideSpeed: 0, tideDir: 0 },
        controls: [
            { key: "enabled", label: "Dalga Aktif", type: "toggle" },
            { key: "amplitude", label: "Genlik (m)", type: "range", min: 0, max: 5, step: 0.1, unit: "m" },
            { key: "wavelength", label: "Dalga Boyu (m)", type: "range", min: 1, max: 50, step: 0.5, unit: "m" },
            { key: "speed", label: "Dalga Hızı (m/s)", type: "range", min: 0, max: 5, step: 0.1, unit: "m/s" },
            { key: "direction", label: "Dalga Yönü (°)", type: "range", min: 0, max: 360, step: 1, unit: "°" },
            { key: "tideSpeed", label: "Gel-git Hızı (m/s)", type: "range", min: 0, max: 3, step: 0.05, unit: "m/s" },
            { key: "tideDir", label: "Gel-git Yönü (°)", type: "range", min: 0, max: 360, step: 1, unit: "°" },
        ],
    },
    {
        id: "airspeed", label: "Hava Hızı Sensörü", icon: "💨",
        color: "#818cf8",
        compute: computeAirspeed,
        defaults: { fail: false, fail2: false, failProbability: 0, noise: 0, offset: 0, ratio: 2.0, negSign: false },
        controls: [
            { key: "noise", label: "Gürültü (m/s)", type: "range", min: 0, max: 5, step: 0.1, unit: "m/s" },
            { key: "offset", label: "Offset (Pa)", type: "range", min: -100, max: 100, step: 1, unit: "Pa" },
            { key: "ratio", label: "Pitot Oranı", type: "range", min: 0.5, max: 5, step: 0.1, unit: "" },
            { key: "fail", label: "Sensör 1 Arızalı", type: "toggle" },
            { key: "fail2", label: "Sensör 2 Arızalı", type: "toggle" },
            { key: "negSign", label: "Negatif İşaret", type: "toggle" },
        ],
    },
    {
        id: "adsb", label: "ADSB Trafik", icon: "✈️",
        color: "#e879f9",
        compute: computeADSB,
        defaults: { count: 0, radius: 1000, altitude: 100, tx: false },
        controls: [
            { key: "count", label: "Araç Sayısı", type: "range", min: 0, max: 20, step: 1, unit: "araç" },
            { key: "radius", label: "Yarıçap (m)", type: "range", min: 100, max: 5000, step: 100, unit: "m" },
            { key: "altitude", label: "Yükseklik (m)", type: "range", min: 0, max: 500, step: 10, unit: "m" },
            { key: "tx", label: "TX Aktif", type: "toggle" },
        ],
    },
    {
        id: "shove", label: "Dış Kuvvet (İtiş)", icon: "💥",
        color: "#fb7185",
        compute: computeShove,
        defaults: { x: 0, y: 0, z: 0, duration: 0 },
        controls: [
            { key: "x", label: "Kuvvet X (N)", type: "range", min: -50, max: 50, step: 0.5, unit: "N" },
            { key: "y", label: "Kuvvet Y (N)", type: "range", min: -50, max: 50, step: 0.5, unit: "N" },
            { key: "z", label: "Kuvvet Z (N)", type: "range", min: -50, max: 50, step: 0.5, unit: "N" },
            { key: "duration", label: "Süre (ms)", type: "range", min: 0, max: 5000, step: 100, unit: "ms" },
        ],
    },
    {
        id: "sensorfail", label: "Sensör Arızaları", icon: "⚠️",
        color: "#fcd34d",
        compute: computeSensorFail,
        defaults: { failAcc1: false, failAcc2: false, failAcc3: false, failGyr1: false, failGyr2: false, failGyr3: false },
        controls: [
            { key: "failAcc1", label: "İvme Ölçer 1 Arızalı", type: "toggle" },
            { key: "failAcc2", label: "İvme Ölçer 2 Arızalı", type: "toggle" },
            { key: "failAcc3", label: "İvme Ölçer 3 Arızalı", type: "toggle" },
            { key: "failGyr1", label: "Jiroskop 1 Arızalı", type: "toggle" },
            { key: "failGyr2", label: "Jiroskop 2 Arızalı", type: "toggle" },
            { key: "failGyr3", label: "Jiroskop 3 Arızalı", type: "toggle" },
        ],
    },
    {
        id: "flow", label: "Optik Akış", icon: "📷",
        color: "#6ee7b7",
        compute: computeOpticalFlow,
        defaults: { enabled: false, rate: 10, noise: 0, posX: 0, posY: 0, posZ: 0, delay: 0 },
        controls: [
            { key: "enabled", label: "Aktif", type: "toggle" },
            { key: "rate", label: "Hız (Hz)", type: "range", min: 1, max: 100, step: 1, unit: "Hz" },
            { key: "noise", label: "Gürültü", type: "range", min: 0, max: 1, step: 0.01, unit: "" },
            { key: "posX", label: "Konum X (m)", type: "range", min: -1, max: 1, step: 0.01, unit: "m" },
            { key: "posY", label: "Konum Y (m)", type: "range", min: -1, max: 1, step: 0.01, unit: "m" },
            { key: "posZ", label: "Konum Z (m)", type: "range", min: -1, max: 1, step: 0.01, unit: "m" },
            { key: "delay", label: "Gecikme (ms)", type: "range", min: 0, max: 500, step: 10, unit: "ms" },
        ],
    },
    {
        id: "sonar", label: "Sonar / Lidar", icon: "📡",
        color: "#7dd3fc",
        compute: computeSonar,
        defaults: { noise: 0, glitchProb: 0, scale: 1.0, rotation: 0, posX: 0, posY: 0, posZ: 0 },
        controls: [
            { key: "noise", label: "Gürültü (m)", type: "range", min: 0, max: 0.5, step: 0.01, unit: "m" },
            { key: "glitchProb", label: "Glitch İhtimali", type: "range", min: 0, max: 1, step: 0.01, unit: "" },
            { key: "scale", label: "Ölçek", type: "range", min: 0.5, max: 2.0, step: 0.01, unit: "" },
            { key: "rotation", label: "Rotasyon (enum)", type: "range", min: 0, max: 35, step: 1, unit: "" },
            { key: "posX", label: "Konum X (m)", type: "range", min: -1, max: 1, step: 0.01, unit: "m" },
            { key: "posY", label: "Konum Y (m)", type: "range", min: -1, max: 1, step: 0.01, unit: "m" },
            { key: "posZ", label: "Konum Z (m)", type: "range", min: -1, max: 1, step: 0.01, unit: "m" },
        ],
    },
    {
        id: "general", label: "Genel Simülasyon", icon: "🖥️",
        color: "#94a3b8",
        compute: computeGeneral,
        defaults: { speedup: 1, terrain: false, loopDelay: 0, rateHz: 1200, timeJitter: 0, uartLoss: 0 },
        controls: [
            { key: "speedup", label: "Hızlandırma Faktörü", type: "range", min: 1, max: 20, step: 1, unit: "x" },
            { key: "rateHz", label: "Simülasyon Hz", type: "range", min: 100, max: 2400, step: 100, unit: "Hz" },
            { key: "timeJitter", label: "Zaman Jitter (ms)", type: "range", min: 0, max: 100, step: 1, unit: "ms" },
            { key: "uartLoss", label: "UART Kayıp (%)", type: "range", min: 0, max: 100, step: 1, unit: "%" },
            { key: "terrain", label: "Arazi Simülasyonu", type: "toggle" },
            { key: "loopDelay", label: "Loop Gecikme (ms)", type: "range", min: 0, max: 100, step: 1, unit: "ms" },
        ],
    },
];

// ─────────────────────────────────────────────────────────────
// STATE & RENDERING ENGINE
// ─────────────────────────────────────────────────────────────

const SIM_STATE = {
    drones: {}
};

// Initialize Styles
(function initStyles() {
    if (document.getElementById('sim-params-styles')) return;
    const style = document.createElement('style');
    style.id = 'sim-params-styles';
    style.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;700&family=IBM+Plex+Sans:wght@400;600;700&display=swap');
        
        .sim-container * { box-sizing: border-box; }
        .sim-container { font-family: 'IBM Plex Sans', sans-serif; color: #f0f6ff; padding: 10px; }
        .sim-group { background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; margin-bottom: 8px; overflow: hidden; transition: border-color 0.2s; }
        .sim-group.open { border-color: var(--group-color, #38bdf8); }
        
        .sim-header { background: transparent; padding: 10px 14px; cursor: pointer; display: flex; align-items: center; gap: 10px; user-select: none; }
        .sim-header:hover { background: rgba(255,255,255,0.03); }
        .sim-header-title { font-weight: 600; font-size: 13px; flex: 1; }
        .sim-header-badge { background: rgba(255,255,255,0.1); color: #fff; border-radius: 12px; padding: 2px 8px; font-size: 10px; font-family: 'IBM Plex Mono', monospace; }
        
        .sim-body { padding: 0 14px 14px; display: none; }
        .sim-group.open .sim-body { display: block; }
        
        .sim-control { margin-bottom: 12px; }
        .sim-control-label { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 11px; color: #94a3b8; font-family: 'IBM Plex Mono', monospace; }
        .sim-control-val { color: #f0f6ff; }
        
        .sim-range { -webkit-appearance: none; width: 100%; background: #1e293b; height: 3px; border-radius: 2px; outline: none; }
        .sim-range::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; border-radius: 50%; background: #38bdf8; cursor: pointer; border: 2px solid #020917; }
        
        .sim-toggle-btn { width: 40px; height: 20px; border-radius: 10px; background: #1e293b; border: 1px solid #334155; position: relative; cursor: pointer; transition: all 0.2s; }
        .sim-toggle-btn.active { background: #38bdf8; border-color: #38bdf8; }
        .sim-toggle-handle { width: 16px; height: 16px; border-radius: 50%; background: #fff; position: absolute; top: 1px; left: 1px; transition: left 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.3); }
        .sim-toggle-btn.active .sim-toggle-handle { left: 21px; }
        
        .sim-select { width: 100%; background: #0f172a; color: #f0f6ff; border: 1px solid #334155; border-radius: 4px; padding: 4px 8px; font-family: 'IBM Plex Mono', monospace; font-size: 11px; outline: none; }
        
        .sim-preview { margin-top: 15px; background: #020917; border-radius: 6px; padding: 8px; border: 1px solid #1e293b; max-height: 200px; overflow-y: auto; }
        .sim-preview-row { display: flex; justify-content: space-between; padding: 2px 0; border-bottom: 1px solid #0f172a; font-size: 10px; font-family: 'IBM Plex Mono', monospace; }
        .sim-preview-key { color: #64748b; }
        .sim-preview-val { color: #38bdf8; }
        
        .sim-actions { display: flex; gap: 10px; margin-top: 10px; padding: 0 10px; }
        .sim-btn { flex: 1; padding: 8px; border-radius: 6px; border: none; font-size: 12px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
        .sim-btn-apply { background: #38bdf8; color: #020917; }
        .sim-btn-apply:hover { background: #0ea5e9; }
        .sim-btn-reset { background: transparent; border: 1px solid #334155; color: #94a3b8; }
        .sim-btn-reset:hover { border-color: #475569; color: #cbd5e1; }
        
        .spinner { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.1); border-top-color: #38bdf8; border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 5px; }
        @keyframes spin { to { transform: rotate(360deg); } }
    `;
    document.head.appendChild(style);
})();

function getDroneState(droneId) {
    if (!SIM_STATE.drones[droneId]) {
        const initialState = {};
        SIM_GROUPS.forEach(g => {
            initialState[g.id] = { ...g.defaults };
        });
        SIM_STATE.drones[droneId] = initialState;
    }
    return SIM_STATE.drones[droneId];
}

function updateParamValue(droneId, groupId, key, value, contextDoc = document) {
    const state = getDroneState(droneId);
    state[groupId][key] = value;

    // Sync state to all drones if modifying 'all'
    if (droneId === 'all') {
        const appState = (window.opener && window.opener.appState) ? window.opener.appState : window.appState;
        if (appState && appState.drones) {
            Object.keys(appState.drones).forEach(dId => {
                const dState = getDroneState(dId);
                dState[groupId][key] = value;
            });
        }
    }

    const valEl = contextDoc.getElementById(`sim-val-${droneId}-${groupId}-${key}`);
    if (valEl) {
        let displayVal = value;
        if (typeof value === 'number') {
            const group = SIM_GROUPS.find(g => g.id === groupId);
            const ctrl = group.controls.find(c => c.key === key);
            if (ctrl) {
                const step = ctrl.step || 1;
                displayVal = Number.isInteger(value) ? value : value.toFixed(Math.abs(step) < 0.01 ? 4 : Math.abs(step) < 0.1 ? 3 : 2);
            }
        }
        valEl.textContent = displayVal;
    }
    updateComputedPreview(droneId, groupId, contextDoc);
}

function updateComputedPreview(droneId, groupId, contextDoc = document) {
    const state = getDroneState(droneId);
    const group = SIM_GROUPS.find(g => g.id === groupId);
    if (!group) return;

    const computed = group.compute(state[groupId]);
    const previewEl = contextDoc.getElementById(`sim-preview-${droneId}-${groupId}`);
    if (previewEl) {
        previewEl.innerHTML = Object.entries(computed).map(([k, v]) => `
            <div class="sim-preview-row">
                <span class="sim-preview-key">${k}</span>
                <span class="sim-preview-val" id="sim-p-val-${droneId}-${k}">${v}</span>
            </div>
        `).join('');
    }
}

function applySimParams(droneId) {
    const state = getDroneState(droneId);
    let commands = [];

    SIM_GROUPS.forEach(g => {
        const computed = g.compute(state[g.id]);
        Object.entries(computed).forEach(([k, v]) => {
            commands.push(`param set ${k} ${v}`);
        });
    });

    const sender = (window.sendDroneCmd) ? window : (window.opener && window.opener.sendDroneCmd) ? window.opener : null;
    const allSender = (window.sendAllDronesCmd) ? window : (window.opener && window.opener.sendAllDronesCmd) ? window.opener : null;

    if (droneId === 'all') {
        if (allSender) {
            commands.forEach(cmd => allSender.sendAllDronesCmd(cmd, false));
            if (window.showToast) window.showToast('Tüm simülasyon parametreleri uygulandı', 'success');
            else if (window.opener && window.opener.showToast) window.opener.showToast('Tüm simülasyon parametreleri uygulandı', 'success');
        }
    } else {
        if (sender) {
            commands.forEach(cmd => sender.sendDroneCmd(droneId, cmd, false));
            if (window.showToast) window.showToast('Simülasyon parametreleri uygulandı', 'success');
            else if (window.opener && window.opener.showToast) window.opener.showToast('Simülasyon parametreleri uygulandı', 'success');
        }
    }
}

function renderAdvancedSimParams(container, droneId = null, contextDoc = document) {
    if (!container) return;
    const uniqueId = droneId || 'all';
    container.innerHTML = '';
    container.className = 'sim-container';

    // Ensure state exists
    const state = getDroneState(uniqueId);

    // Add "Open in Popup" button if not in popup already
    if (contextDoc === document) {
        const popBtn = document.createElement('button');
        popBtn.textContent = "⧉ Ayrı Pencere";
        popBtn.className = "sim-btn sim-btn-reset";
        popBtn.style.marginBottom = "10px";
        popBtn.onclick = () => openSimPopup(droneId);
        container.appendChild(popBtn);
    }

    SIM_GROUPS.forEach(group => {
        const groupEl = contextDoc.createElement('div');
        groupEl.className = 'sim-group';
        groupEl.style.setProperty('--group-color', group.color);

        // Body
        const body = contextDoc.createElement('div');
        body.className = 'sim-body';

        // Header
        const header = contextDoc.createElement('div');
        header.className = 'sim-header';
        header.innerHTML = `
            <span style="font-size: 18px;">${group.icon}</span>
            <span class="sim-header-title">${group.label}</span>
            <span class="sim-header-badge" style="color:${group.color}; background:${group.color}22">Ayarlar</span>
        `;
        header.onclick = () => {
            const isOpen = groupEl.classList.toggle('open');
            if (isOpen) {
                updateComputedPreview(uniqueId, group.id, contextDoc);
                if (window.refreshSimGroupParams) {
                    window.refreshSimGroupParams(uniqueId, group.id, body, contextDoc);
                } else if (window.opener && window.opener.refreshSimGroupParams) {
                    window.opener.refreshSimGroupParams(uniqueId, group.id, body, contextDoc);
                }
            }
        };

        // Controls
        group.controls.forEach(ctrl => {
            const wrapper = contextDoc.createElement('div');
            wrapper.className = 'sim-control';
            const currentVal = state[group.id][ctrl.key];

            const labelRow = contextDoc.createElement('div');
            labelRow.className = 'sim-control-label';

            let displayVal = currentVal;
            if (typeof currentVal === 'number') {
                const step = ctrl.step || 1;
                displayVal = Number.isInteger(currentVal) ? currentVal : currentVal.toFixed(Math.abs(step) < 0.01 ? 4 : Math.abs(step) < 0.1 ? 3 : 2);
            }

            labelRow.innerHTML = `<span>${ctrl.label}</span><span id="sim-val-${uniqueId}-${group.id}-${ctrl.key}" class="sim-control-val">${displayVal}</span>`;
            wrapper.appendChild(labelRow);

            if (ctrl.type === 'range' || ctrl.type === 'number') {
                const input = contextDoc.createElement('input');
                input.type = ctrl.type;
                input.id = `sim-input-${uniqueId}-${group.id}-${ctrl.key}`;
                input.className = 'sim-range';
                input.min = ctrl.min;
                input.max = ctrl.max;
                input.step = ctrl.step;
                input.value = currentVal;
                input.oninput = (e) => updateParamValue(uniqueId, group.id, ctrl.key, parseFloat(e.target.value), contextDoc);
                wrapper.appendChild(input);
            } else if (ctrl.type === 'toggle') {
                const toggle = contextDoc.createElement('div');
                toggle.id = `sim-input-${uniqueId}-${group.id}-${ctrl.key}`;
                toggle.className = `sim-toggle-btn ${currentVal ? 'active' : ''}`;
                toggle.innerHTML = '<div class="sim-toggle-handle"></div>';
                toggle.onclick = function () {
                    const newVal = !state[group.id][ctrl.key];
                    state[group.id][ctrl.key] = newVal;
                    this.className = `sim-toggle-btn ${newVal ? 'active' : ''}`;
                    updateParamValue(uniqueId, group.id, ctrl.key, newVal, contextDoc);
                };
                wrapper.appendChild(toggle);
            } else if (ctrl.type === 'select') {
                const select = contextDoc.createElement('select');
                select.id = `sim-input-${uniqueId}-${group.id}-${ctrl.key}`;
                select.className = 'sim-select';
                ctrl.options.forEach(opt => {
                    const option = contextDoc.createElement('option');
                    option.value = opt.value;
                    option.textContent = opt.label;
                    if (opt.value === currentVal) option.selected = true;
                    select.appendChild(option);
                });
                select.onchange = (e) => updateParamValue(uniqueId, group.id, ctrl.key, e.target.value, contextDoc);
                wrapper.appendChild(select);
            }

            body.appendChild(wrapper);
        });

        const preview = contextDoc.createElement('div');
        preview.id = `sim-preview-${uniqueId}-${group.id}`;
        preview.className = 'sim-preview';
        body.appendChild(preview);

        groupEl.appendChild(header);
        groupEl.appendChild(body);
        container.appendChild(groupEl);
    });

    const actions = contextDoc.createElement('div');
    actions.className = 'sim-actions';

    const resetBtn = contextDoc.createElement('button');
    resetBtn.className = 'sim-btn sim-btn-reset';
    resetBtn.textContent = 'Sıfırla';
    resetBtn.onclick = () => renderAdvancedSimParams(container, droneId, contextDoc);

    const applyBtn = contextDoc.createElement('button');
    applyBtn.className = 'sim-btn sim-btn-apply';
    applyBtn.textContent = 'Tümünü Uygula';
    applyBtn.onclick = () => applySimParams(uniqueId);

    actions.appendChild(resetBtn);
    actions.appendChild(applyBtn);
    container.appendChild(actions);
}

// ─────────────────────────────────────────────────────────────
// POPUP WINDOW HANDLING
// ─────────────────────────────────────────────────────────────

let simPopupRef = null;
window.simPopupRef = null;

function openSimPopup(droneId) {
    if (simPopupRef && !simPopupRef.closed) {
        simPopupRef.focus();
        return;
    }

    const width = 800;
    const height = 900;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;

    simPopupRef = window.open('', 'SimParamsPopup',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`);
    window.simPopupRef = simPopupRef;

    if (!simPopupRef) {
        alert("Popup engellendi! Lütfen izin verin.");
        return;
    }

    const doc = simPopupRef.document;

    // Inject Styles & Content
    doc.open();
    doc.write(`
        <!DOCTYPE html>
        <html lang="tr">
        <head>
            <meta charset="UTF-8">
            <title>ArduPilot Simülasyon Paneli</title>
            <style>
                body { background-color: #020917; margin: 0; padding: 0; color: #f0f6ff; font-family: 'IBM Plex Sans', sans-serif; display: flex; flex-direction: column; height: 100vh; }
                .sim-popup-tabs { display: flex; background: #0a1628; border-bottom: 1px solid #1e293b; overflow-x: auto; padding: 0 10px; flex-shrink: 0; }
                .sim-popup-tab { padding: 12px 20px; color: #94a3b8; font-size: 13px; font-weight: 600; cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.2s; white-space: nowrap; }
                .sim-popup-tab:hover { color: #cbd5e1; background: rgba(255,255,255,0.02); }
                .sim-popup-tab.active { color: #38bdf8; border-bottom-color: #38bdf8; background: rgba(56, 189, 248, 0.05); }
                #sim-popup-container { flex: 1; overflow-y: auto; padding: 20px; }
            </style>
        </head>
        <body>
            <div id="sim-tabs" class="sim-popup-tabs"></div>
            <div id="sim-popup-container"></div>
            <script>
                // Proxy functions
                window.opener = window.opener;
                window.sendDroneCmd = (id, cmd, verbose) => window.opener.sendDroneCmd(id, cmd, verbose);
                window.sendAllDronesCmd = (cmd, verbose) => window.opener.sendAllDronesCmd(cmd, verbose);
                
                // Expose update function
                window.updateSimParamPreview = (id, val) => {
                     const el = document.getElementById(id);
                     if (el) {
                        el.textContent = val;
                        el.style.transition = 'color 0.2s';
                        el.style.color = '#4ade80';
                        setTimeout(() => el.style.color = '', 500);
                     }
                };

                // Render Tabs
                function renderTabs(activeId) {
                    const tabsContainer = document.getElementById('sim-tabs');
                    // Check appState from opener
                    if (!tabsContainer || !window.opener || !window.opener.appState) return;

                    const drones = window.opener.appState.drones || {};
                    let html = '';

                    const allClass = activeId === 'all' ? 'active' : '';
                    html += \`<div class="sim-popup-tab \${allClass}" onclick="switchTab('all')">Tümü (All)</div>\`;

                    Object.keys(drones).forEach(id => {
                        const activeClass = activeId === id ? 'active' : '';
                        html += \`<div class="sim-popup-tab \${activeClass}" onclick="switchTab('\${id}')">\${id}</div>\`; 
                    });

                    tabsContainer.innerHTML = html;
                }

                window.switchTab = (id) => {
                    renderTabs(id);
                    const container = document.getElementById('sim-popup-container');
                    // Call render function from parent script context but passing this doc
                    if (window.opener && window.opener.renderAdvancedSimParams) {
                        window.opener.renderAdvancedSimParams(container, id === 'all' ? null : id, document);
                    }
                };

                // Initial Render
                const initialId = '${droneId || 'all'}';
                switchTab(initialId);
            </script>
        </body>
        </html>
    `);
    doc.close();

    // Init styles in popup
    const popupStyle = doc.createElement('style');
    // Copy styles from main Sim Panel style tag
    const mainStyle = document.getElementById('sim-params-styles');
    if (mainStyle) popupStyle.textContent = mainStyle.textContent;
    doc.head.appendChild(popupStyle);

    // Render Params
    // We use the same render function but pass the popup's container
    // And we need to ensure the render function uses the popup document to create elements? 
    // Actually, document.createElement creates elements in the current window context.
    // If we run renderAdvancedSimParams in main window context on a container from popup window, 
    // it *might* work but event handlers will be bound to main window context. This is what we want.

    setTimeout(() => {
        const container = doc.getElementById('sim-popup-container');
        if (container) {
            renderAdvancedSimParams(container, droneId, doc);
        }
    }, 100);

    // Cleanup on close
    simPopupRef.onbeforeunload = () => {
        simPopupRef = null;
    };
}


// ─────────────────────────────────────────────────────────────
// STATE SYNC HELPERS (INVERSE MAPPING)
// ─────────────────────────────────────────────────────────────

const PARAM_TO_STATE_MAP = {
    "SIM_WIND_SPD": { g: "wind", k: "speed" },
    "SIM_WIND_DIR": { g: "wind", k: "direction" },
    "SIM_WIND_DIR_Z": { g: "wind", k: "verticalSpeed" },
    "SIM_WIND_TURB": { g: "wind", k: "turbulance", scale: 2.0 },

    "SIM_GPS1_NOISE": { g: "gps", k: "noiseLevel" }, // loose mapping
    "SIM_GPS1_GLTCH_X": { g: "gps", k: "glitchX" },
    "SIM_GPS1_GLTCH_Y": { g: "gps", k: "glitchY" },
    "SIM_GPS1_GLTCH_Z": { g: "gps", k: "glitchZ" },

    "SIM_BARO_RND": { g: "baro", k: "noiseLevel", scale: 1 / 3.0 },
    "SIM_BARO_GLITCH": { g: "baro", k: "glitch" },

    "SIM_VIB_MOT_MAX": { g: "imu", k: "vibrationLevel", scale: 1 / 200.0 },
    "SIM_GYR1_BIAS_X": { g: "imu", k: "gyroBiasX" },
    "SIM_GYR1_BIAS_Y": { g: "imu", k: "gyroBiasY" },
    "SIM_GYR1_BIAS_Z": { g: "imu", k: "gyroBiasZ" },
    "SIM_ACC1_BIAS_X": { g: "imu", k: "accBiasX" },
    "SIM_ACC1_BIAS_Y": { g: "imu", k: "accBiasY" },
    "SIM_ACC1_BIAS_Z": { g: "imu", k: "accBiasZ" },

    "SIM_MAG_RND": { g: "mag", k: "noiseLevel" },
    "SIM_MAG1_OFS_X": { g: "mag", k: "offsetX" },
    "SIM_MAG1_OFS_Y": { g: "mag", k: "offsetY" },
    "SIM_MAG1_OFS_Z": { g: "mag", k: "offsetZ" },

    "SIM_TEMP_START": { g: "temp", k: "temperature" },

    "SIM_BATT_VOLTAGE": { g: "battery", k: "voltage" },
    "SIM_BATT_CAP_AH": { g: "battery", k: "capacityAh" },

    "SIM_ENGINE_MUL": { g: "engine", k: "powerPercent", scale: 100 },
};

window.updateSimStateFromParam = function (droneId, param, val) {
    const map = PARAM_TO_STATE_MAP[param];
    if (map) {
        let value = val;
        if (map.scale) value *= map.scale;

        // State update
        const state = getDroneState(droneId);
        if (state[map.g]) {
            state[map.g][map.k] = value;

            // Update in main document and popup document if exists
            const updateUI = (doc) => {
                if (window.updateInputFromState) {
                    window.updateInputFromState(droneId, map.g, map.k, value, doc);
                }
                if (window.updateComputedPreview) {
                    window.updateComputedPreview(droneId, map.g, doc);
                }
            };

            // Main Doc
            updateUI(document);

            // Popup Doc
            if (window.simPopupRef && !window.simPopupRef.closed) {
                updateUI(window.simPopupRef.document);
            }
        }
    }
};

window.refreshSimParams = function (droneId) {
    // If 'all', try to fetch from first available drone
    let targetId = droneId;
    if (droneId === 'all') {
        if (window.appState && window.appState.drones) {
            const keys = Object.keys(window.appState.drones);
            if (keys.length > 0) targetId = keys[0];
            else return;
        } else if (window.opener && window.opener.appState && window.opener.appState.drones) {
            const keys = Object.keys(window.opener.appState.drones);
            if (keys.length > 0) targetId = keys[0];
            else return;
        } else {
            return;
        }
    }

    // Send param show command
    // We request only SIM_* to reduce traffic
    // Send param show command
    // We request only SIM_* to reduce traffic
    const cmd = 'param show SIM_*';
    if (window.sendDroneCmd) {
        window.sendDroneCmd(targetId, cmd, false);
    } else if (window.opener && window.opener.sendDroneCmd) {
        window.opener.sendDroneCmd(targetId, cmd, false);
    }
};

window.getGroupParamPrefix = function (groupId) {
    switch (groupId) {
        case 'wind': return 'SIM_WIND_*';
        case 'gps': return 'SIM_GPS_*';
        case 'baro': return 'SIM_BARO_*';
        case 'imu': return 'SIM_ACC* SIM_GYR* SIM_VIB*';
        case 'mag': return 'SIM_MAG_*';
        case 'temp': return 'SIM_TEMP_*';
        case 'battery': return 'SIM_BATT_*';
        case 'engine': return 'SIM_ENGINE* SIM_ESC_*';
        case 'wave': return 'SIM_WAVE* SIM_TIDE*';
        default: return 'SIM_*';
    }
};

window.refreshSimGroupParams = function (droneId, groupId, containerEl, contextDoc) {
    // Create loader overlay
    const loader = contextDoc.createElement('div');
    loader.className = 'sim-group-loader';
    loader.innerHTML = '<div class="spinner"></div><span>Lütfen bekleyin...</span>';
    loader.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(13,20,30,0.8); display:flex; flex-direction:column; align-items:center; justify-content:center; z-index:10; font-size:12px; color:#aaa; backdrop-filter:blur(2px); pointer-events:all;';

    // Position container relative
    if (getComputedStyle(containerEl).position === 'static') {
        containerEl.style.position = 'relative';
    }
    containerEl.appendChild(loader);

    // Determine Target ID
    let targetId = droneId;
    if (droneId === 'all') {
        if (window.appState && window.appState.drones) {
            const keys = Object.keys(window.appState.drones);
            if (keys.length > 0) targetId = keys[0];
            else { loader.remove(); return; }
        } else if (window.opener && window.opener.appState && window.opener.appState.drones) {
            const keys = Object.keys(window.opener.appState.drones);
            if (keys.length > 0) targetId = keys[0];
            else { loader.remove(); return; }
        } else {
            loader.remove();
            return;
        }
    }

    const prefix = window.getGroupParamPrefix(groupId);
    const prefixes = prefix.split(' ');

    prefixes.forEach(p => {
        const cmd = `param show ${p}`;
        if (window.sendDroneCmd) window.sendDroneCmd(targetId, cmd, false);
        else if (window.opener && window.opener.sendDroneCmd) window.opener.sendDroneCmd(targetId, cmd, false);
    });

    // Remove loader after timeout
    setTimeout(() => {
        if (loader.parentNode) loader.remove();
    }, 1500);
};

window.updateInputFromState = function (droneId, groupId, key, value, contextDoc = document) {
    const inputId = `sim-input-${droneId}-${groupId}-${key}`;
    const valId = `sim-val-${droneId}-${groupId}-${key}`;

    let el = contextDoc.getElementById(inputId);
    let vEl = contextDoc.getElementById(valId);

    // Fallback to 'all' if specific drone ID not found (happens in 'All' tab)
    if (!el && droneId !== 'all') {
        el = contextDoc.getElementById(`sim-input-all-${groupId}-${key}`);
        vEl = contextDoc.getElementById(`sim-val-all-${groupId}-${key}`);
    }

    // Update Numerical Label
    if (vEl) {
        let displayVal = value;
        if (typeof value === 'number') {
            const group = SIM_GROUPS.find(g => g.id === groupId);
            const ctrl = group && group.controls.find(c => c.key === key);
            if (ctrl) {
                const step = ctrl.step || 1;
                displayVal = Number.isInteger(value) ? value : value.toFixed(Math.abs(step) < 0.01 ? 4 : Math.abs(step) < 0.1 ? 3 : 2);
            }
        }
        vEl.textContent = displayVal;
    }

    // Update Input (Slider/Toggle/Select)
    if (el) {
        if (el.type === 'checkbox' || (el.className && el.className.includes('sim-toggle-btn'))) {
            if (el.tagName === 'DIV') {
                el.className = `sim-toggle-btn ${value ? 'active' : ''}`;
            } else {
                el.checked = !!value;
            }
        } else if (el.tagName === 'SELECT') {
            el.value = value;
        } else {
            el.value = value;
        }
    }
};
