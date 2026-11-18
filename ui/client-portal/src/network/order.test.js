import { orderEndpoints } from './order';

class FakeEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = FakeEventSource.CONNECTING;
    this.listeners = {};
    this.closed = false;
    FakeEventSource.instances.push(this);
  }

  addEventListener(name, fn) {
    this.listeners[name] = fn;
  }

  close() {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
  }

  open() {
    this.readyState = FakeEventSource.OPEN;
    this.onopen?.();
  }

  fail(readyState) {
    this.readyState = readyState;
    this.onerror?.(new Error('boom'));
  }
}

describe('orderEndpoints.trackOrder', () => {
  let originalEventSource;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    originalEventSource = global.EventSource;
    global.EventSource = FakeEventSource;
    FakeEventSource.instances = [];
  });

  afterEach(() => {
    global.EventSource = originalEventSource;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('connects to the order stream', () => {
    orderEndpoints.trackOrder('o-1', jest.fn());

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toMatch(/\/sse\/order\/o-1$/);
  });

  test('retries with exponential backoff after the browser gives up, then resets once connected', () => {
    orderEndpoints.trackOrder('o-1', jest.fn());

    FakeEventSource.instances[0].fail(FakeEventSource.CLOSED);
    jest.advanceTimersByTime(999);
    expect(FakeEventSource.instances).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(FakeEventSource.instances).toHaveLength(2);

    FakeEventSource.instances[1].fail(FakeEventSource.CLOSED);
    jest.advanceTimersByTime(1999);
    expect(FakeEventSource.instances).toHaveLength(2);
    jest.advanceTimersByTime(1);
    expect(FakeEventSource.instances).toHaveLength(3);

    FakeEventSource.instances[2].open();
    FakeEventSource.instances[2].fail(FakeEventSource.CLOSED);
    jest.advanceTimersByTime(1000); // backoff restarted from one second
    expect(FakeEventSource.instances).toHaveLength(4);
  });

  test('leaves transient errors to the browser, which reconnects on its own', () => {
    orderEndpoints.trackOrder('o-1', jest.fn());

    FakeEventSource.instances[0].fail(FakeEventSource.CONNECTING);
    jest.advanceTimersByTime(60000);

    expect(FakeEventSource.instances).toHaveLength(1);
  });

  test('asks the caller to resync after a reconnect, but not on the first connection', () => {
    const onMessage = jest.fn();
    orderEndpoints.trackOrder('o-1', onMessage);

    FakeEventSource.instances[0].open();
    expect(onMessage).not.toHaveBeenCalled();

    FakeEventSource.instances[0].fail(FakeEventSource.CONNECTING);
    FakeEventSource.instances[0].open(); // the browser reconnected the same source
    expect(onMessage).toHaveBeenCalledWith({ type: 'sse-reconnected' });
  });

  test('close() stops everything, including a pending retry', () => {
    const handle = orderEndpoints.trackOrder('o-1', jest.fn());
    FakeEventSource.instances[0].fail(FakeEventSource.CLOSED);

    handle.close();
    jest.advanceTimersByTime(60000);

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].closed).toBe(true);
  });

  test('delivers parsed updates and location pings', () => {
    const onMessage = jest.fn();
    const onLocation = jest.fn();
    orderEndpoints.trackOrder('o-1', onMessage, onLocation);
    const source = FakeEventSource.instances[0];

    source.listeners['order-update']({ data: JSON.stringify({ status: 'ROUTED' }) });
    source.listeners['location-update']({ data: JSON.stringify({ latitude: 1, longitude: 2 }) });
    source.listeners['location-update']({ data: 'not json' });

    expect(onMessage).toHaveBeenCalledWith({ status: 'ROUTED' });
    expect(onLocation).toHaveBeenCalledTimes(1);
    expect(onLocation).toHaveBeenCalledWith({ latitude: 1, longitude: 2 });
  });
});
