// Mock AudioContext for jsdom test environment
class MockAudioContext {
  state = 'running' as AudioContextState;
  sampleRate = 44100;
  currentTime = 0;
  resume() { return Promise.resolve(); }
  createOscillator() {
    return {
      type: 'sine', frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      detune: { value: 0 },
      connect() { return this; }, start() {}, stop() {},
    };
  }
  createGain() {
    return {
      gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect() { return this; },
    };
  }
  createBuffer(channels: number, length: number, sampleRate: number) {
    return { getChannelData: () => new Float32Array(length) };
  }
  createBufferSource() {
    return { buffer: null, connect() { return this; }, start() {}, stop() {} };
  }
  createBiquadFilter() {
    return {
      type: 'bandpass', frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      Q: { value: 0 }, connect() { return this; },
    };
  }
  get destination() { return {}; }
}

globalThis.AudioContext = MockAudioContext as unknown as typeof AudioContext;
