import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import OrderDetails from './OrderDetails';
import { orderEndpoints } from '../network/order';

jest.mock('./LiveDeliveryMap', () => ({
  __esModule: true,
  default: ({ driverLocation }) => (
    <div data-testid="map">{driverLocation ? `${driverLocation.latitude},${driverLocation.longitude}` : 'no-location'}</div>
  ),
}));
jest.mock('../network/order', () => ({
  orderEndpoints: { getOrderEvents: jest.fn(), trackOrder: jest.fn() },
}));

const props = {
  getStatusColor: () => ({}),
  getStatusIcon: () => null,
  formatStatus: (s) => s,
};

const order = (id, extra = {}) => ({ orderId: id, status: 'IN_TRANSIT', deliveryAddress: `${id} Road`, ...extra });

describe('OrderDetails', () => {
  let streams;

  beforeEach(() => {
    streams = [];
    jest.clearAllMocks();
    orderEndpoints.getOrderEvents.mockResolvedValue([]);
    orderEndpoints.trackOrder.mockImplementation((orderId, onMessage, onLocation) => {
      const stream = { orderId, onMessage, onLocation, close: jest.fn() };
      streams.push(stream);
      return stream;
    });
  });

  test("switching orders never shows the previous order's truck position", async () => {
    const { rerender } = render(<OrderDetails {...props} order={order('A')} />);
    await waitFor(() => expect(streams).toHaveLength(1));
    act(() => streams[0].onLocation({ latitude: 6.9, longitude: 79.8 }));
    expect(screen.getByTestId('map')).toHaveTextContent('6.9,79.8');

    rerender(<OrderDetails {...props} order={order('B')} />);

    // Synchronously after the switch: no flash of A's position.
    expect(screen.getByTestId('map')).toHaveTextContent('no-location');
    await waitFor(() => expect(streams).toHaveLength(2));
    expect(streams[0].close).toHaveBeenCalled();
    expect(streams[1].orderId).toBe('B');
  });

  test('closes the stream on unmount', async () => {
    const { unmount } = render(<OrderDetails {...props} order={order('A')} />);
    await waitFor(() => expect(streams).toHaveLength(1));

    unmount();

    expect(streams[0].close).toHaveBeenCalled();
  });

  test('status pushes refresh the order list, using the latest callback without resubscribing', async () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = render(<OrderDetails {...props} order={order('A')} onOrderUpdated={first} />);
    await waitFor(() => expect(streams).toHaveLength(1));

    rerender(<OrderDetails {...props} order={order('A')} onOrderUpdated={second} />);
    act(() => streams[0].onMessage({ orderId: 'A', status: 'DELIVERED' }));

    expect(streams).toHaveLength(1); // same stream, not re-subscribed
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  test('a reconnect resyncs the list and the audit trail', async () => {
    const onOrderUpdated = jest.fn();
    render(<OrderDetails {...props} order={order('A')} onOrderUpdated={onOrderUpdated} />);
    await waitFor(() => expect(streams).toHaveLength(1));
    const loadsBefore = orderEndpoints.getOrderEvents.mock.calls.length;

    act(() => streams[0].onMessage({ type: 'sse-reconnected' }));

    expect(onOrderUpdated).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(orderEndpoints.getOrderEvents.mock.calls.length).toBe(loadsBefore + 1));
  });

  test('identity is only called verified when a signature image exists', async () => {
    const { rerender } = render(
      <OrderDetails {...props} order={order('A', { status: 'DELIVERED', proofOfDeliverySignature: 'data:image/png;base64,AAA' })} />
    );
    expect(await screen.findByText(/Identity Verified/)).toBeInTheDocument();

    rerender(<OrderDetails {...props} order={order('B', { status: 'DELIVERED' })} />);

    expect(await screen.findByText('No signature image recorded')).toBeInTheDocument();
    expect(screen.queryByText(/Identity Verified/)).not.toBeInTheDocument();
  });
});
