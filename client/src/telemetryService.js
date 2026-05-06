const EventEmitter = require('events');

class TelemetryService extends EventEmitter {
  constructor() {
    super();
    this.telemetry = null;
    this.currentData = null;
    this.isConnected = false;
    this.useFallback = false;
    this.pollInterval = null;
  }

  initialize() {
    try {
      // Tenta carregar o módulo nativo
      const { truckSimTelemetry } = require('trucksim-telemetry');
      this.telemetry = truckSimTelemetry();
      console.log('✅ TruckSim Telemetry carregado (modo nativo)');
      this.setupNativeListeners();
    } catch (err) {
      console.warn('⚠️ Módulo nativo indisponível, usando simulação:', err.message);
      this.useFallback = true;
      this.setupFallback();
    }
  }

  setupNativeListeners() {
    this.telemetry.on('connected', () => {
      this.isConnected = true;
      console.log('✅ ETS2 SDK Connected');
      this.emit('connected');
    });

    this.telemetry.on('disconnected', () => {
      this.isConnected = false;
      console.log('❌ ETS2 SDK Disconnected');
      this.emit('disconnected');
    });

    this.telemetry.on('telemetry', (data) => {
      this.currentData = this.formatTelemetry(data);
      this.emit('telemetry', this.currentData);
    });

    this.telemetry.on('job-started', (data) => {
      console.log('📦 Job Started:', data);
      this.emit('job-started', data);
    });

    this.telemetry.on('job-finished', (data) => {
      console.log('✔️ Job Finished:', data);
      this.emit('job-finished', data);
    });
  }

  setupFallback() {
    console.log('🎮 Modo simulação ativado');
    // Emite evento de conectado imediatamente
    setTimeout(() => {
      this.isConnected = true;
      this.emit('connected');
    }, 500);

    // Polling simulado
    this.pollInterval = setInterval(() => {
      const simulatedData = this.generateSimulatedData();
      this.currentData = simulatedData;
      this.emit('telemetry', this.currentData);
    }, 500);
  }

  generateSimulatedData() {
    return {
      gameConnected: this.isConnected,
      simulationTime: Date.now(),
      paused: false,
      speedKmh: Math.floor(Math.random() * 130) + 30,
      speedMph: Math.floor(Math.random() * 80) + 20,
      rpm: Math.floor(Math.random() * 1500) + 800,
      gear: Math.floor(Math.random() * 12),
      gearCount: 12,
      odometer: Math.floor(Math.random() * 500000),
      fuelAmountLiters: Math.random() * 400 + 100,
      fuelCapacityLiters: 400,
      fuelPercent: Math.random() * 100,
      adblueAmountLiters: Math.random() * 100,
      adblueCapacityLiters: 100,
      engineDamage: Math.random() * 0.3,
      transmissionDamage: Math.random() * 0.2,
      cabinDamage: Math.random() * 0.1,
      chassisDamage: Math.random() * 0.15,
      wheelsDamage: Math.random() * 0.25,
      cargoDamage: 0,
      lightsBeamLow: Math.random() > 0.5,
      lightsBeamHigh: Math.random() > 0.8,
      lightsAuxFront: false,
      lightsAuxRoof: false,
      lightsBlinkerLeftActive: Math.random() > 0.9,
      lightsBlinkerRightActive: Math.random() > 0.9,
      lightsParking: false,
      lightsBrake: Math.random() > 0.8,
      lightsReverse: Math.random() > 0.95,
      lightsHazard: false,
      airPressure: Math.random() * 8 + 7,
      brakePressure: Math.random() * 6,
      parkingBrake: false,
      cruiseControl: Math.random() > 0.7,
      cruiseControlSpeed: 90,
      trailerAttached: true,
      trailerCount: 1,
      jobIncome: Math.floor(Math.random() * 5000) + 1000,
      jobDeadlineTime: Math.floor(Math.random() * 3600),
      jobDeadlineRemaining: Math.floor(Math.random() * 1800),
      jobCargoId: 1,
      jobCargoMass: Math.floor(Math.random() * 20) + 5,
      jobDestinationCity: 'Berlin',
      jobDestinationCompany: 'DHL',
      jobSourceCity: 'Amsterdam',
      jobSourceCompany: 'FEDEX',
      jobInProgress: true,
      jobDelivered: false,
      navigationDistance: Math.floor(Math.random() * 500) + 100,
      navigationTime: Math.floor(Math.random() * 3600) + 1800,
      navigationSpeedLimit: 130,
      transmissionShiftable: true,
      transmissionAutomatic: false,
      rawData: {}
    };
  }

  formatTelemetry(data) {
    const truck = data.truck || {};
    const trailer = data.trailer || {};
    const job = data.job || {};
    const navigation = data.navigation || {};
    const fuelInfo = truck.fuel || {};
    const truckDamage = truck.damage || {};
    const trailerDamage = trailer.damage || {};
    const lights = truck.light || {};

    return {
      gameConnected: data.connected || false,
      simulationTime: data.simulation_timestamp,
      paused: data.paused || false,
      speedKmh: truck.speed_value || 0,
      speedMph: (truck.speed_value || 0) * 0.621371,
      rpm: truck.engine_rpm || 0,
      gear: truck.gear || 0,
      gearCount: truck.gear_count || 0,
      gearRanges: truck.gear_ranges || [],
      odometer: truck.odometer || 0,
      fuelAmountLiters: fuelInfo.value || 0,
      fuelCapacityLiters: fuelInfo.max_value || 0,
      fuelPercent: fuelInfo.max_value ? (fuelInfo.value / fuelInfo.max_value) * 100 : 0,
      adblueAmountLiters: truck.adblue_value || 0,
      adblueCapacityLiters: truck.adblue_max_value || 0,
      engineDamage: truckDamage.engine || 0,
      transmissionDamage: truckDamage.transmission || 0,
      cabinDamage: truckDamage.cabin || 0,
      chassisDamage: truckDamage.chassis || 0,
      wheelsDamage: truckDamage.wheels || 0,
      cargoDamage: trailerDamage.cargo || 0,
      lightsBeamLow: lights.beam_low || false,
      lightsBeamHigh: lights.beam_high || false,
      lightsAuxFront: lights.aux_front || false,
      lightsAuxRoof: lights.aux_roof || false,
      lightsBlinkerLeftActive: lights.blinker_left_active || false,
      lightsBlinkerRightActive: lights.blinker_right_active || false,
      lightsParking: lights.parking || false,
      lightsBrake: lights.brake || false,
      lightsReverse: lights.reverse || false,
      lightsHazard: lights.hazard || false,
      airPressure: truck.air_pressure_value || 0,
      brakePressure: truck.brake_pressure_value || 0,
      parkingBrake: truck.parking_brake || false,
      cruiseControl: truck.cruise_control || false,
      cruiseControlSpeed: truck.cruise_control_speed || 0,
      trailerAttached: data.trailers && data.trailers.length > 0,
      trailerCount: (data.trailers || []).length,
      jobIncome: job.income || 0,
      jobDeadlineTime: job.deadline || 0,
      jobDeadlineRemaining: job.remaining_time || 0,
      jobCargoId: job.cargo_id || 0,
      jobCargoMass: job.cargo_mass || 0,
      jobDestinationCity: job.destination_city || '',
      jobDestinationCompany: job.destination_company || '',
      jobSourceCity: job.source_city || '',
      jobSourceCompany: job.source_company || '',
      jobInProgress: job.started || false,
      jobDelivered: job.delivered || false,
      navigationDistance: navigation.distance_remaining || 0,
      navigationTime: navigation.time_remaining || 0,
      navigationSpeedLimit: navigation.speed_limit || 0,
      transmissionShiftable: truck.transmission_type === 1,
      transmissionAutomatic: truck.transmission_type === 2,
      rawData: data
    };
  }

  getCurrentData() {
    return this.currentData;
  }

  isGameConnected() {
    return this.isConnected;
  }

  shutdown() {
    if (this.useFallback && this.pollInterval) {
      clearInterval(this.pollInterval);
    }
    if (this.telemetry) {
      this.telemetry.close?.();
    }
  }
}

module.exports = TelemetryService;
