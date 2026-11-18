import React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Root from './App';
import { getAssignedOrders, startDelivery } from './network/driver';
import { logout } from './network/auth';
import { useDriverWebSocket } from './network/useDriverWebSocket';

jest.mock('./network/driver', () => ({
  getAssignedOrders: jest.fn(),
  startDelivery: jest.fn(),
  submitProofOfDelivery: jest.fn(),
}));
jest.mock('./network/auth', () => ({ login: jest.fn(), signup: jest.fn(), logout: jest.fn() }));
jest.mock('./network/useDriverWebSocket', () => ({ useDriverWebSocket: jest.fn() }));
jest.mock('./components/LiveDeliveryMap', () => ({
  __esModule: true,
  default: () => null,
  ...jest.requireActual('./utils/geo'),
}));

const DRIVER = { driverId: 'drv-1', driverName: 'driver1@swift.lk', vehicleId: 'WP CAB-1', token: 'jwt-token' };
const orders = () => [
  { orderId: 'o-1', status: 'ROUTED', deliveryAddress: '1 First Street', city: 'Colombo' },
  { orderId: 'o-2', status: 'ROUTED', deliveryAddress: '15 Bauddhaloka Mawatha, Colombo 04', city: 'Colombo' },
];

describe('driver delivery flow', () => {
  let publishLocation;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    localStorage.setItem('driver_token', DRIVER.token);
    localStorage.setItem('driver_details', JSON.stringify(DRIVER));
    getAssignedOrders.mockResolvedValue(orders());
    startDelivery.mockResolvedValue(null);
    logout.mockResolvedValue({ message: 'Logged out successfully' });
    publishLocation = jest.fn();
    useDriverWebSocket.mockReturnValue({ connected: true, publishLocation });
  });

  afterEach(() => {
    jest.useRealTimers();
    localStorage.clear();
  });

  const listStartButtons = async () => {
    const heading = await screen.findByText("Today's Deliveries");
    const card = heading.closest('.card');
    await waitFor(() => expect(within(card).getAllByRole('button', { name: 'Start' })).toHaveLength(2));
    return within(card).getAllByRole('button', { name: 'Start' });
  };

  test('starting the second delivery starts and simulates that delivery, not the first', async () => {
    render(<Root />);
    const [, startSecond] = await listStartButtons();

    userEvent.click(startSecond);

    await waitFor(() => expect(startDelivery).toHaveBeenCalledWith('o-2'));
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(publishLocation).toHaveBeenCalled();
    expect(publishLocation.mock.calls.every(([, orderId]) => orderId === 'o-2')).toBe(true);
  });

  test('raw GPS publishing is paused while the simulator runs', async () => {
    render(<Root />);
    const [startFirst] = await listStartButtons();
    const lastPauseFlag = () => {
      const calls = useDriverWebSocket.mock.calls;
      return calls[calls.length - 1][4];
    };
    expect(lastPauseFlag()).toBe(false);

    userEvent.click(startFirst);

    await waitFor(() => expect(lastPauseFlag()).toBe(true));
  });

  test('the delivery list survives a failed refresh', async () => {
    render(<Root />);
    await listStartButtons();
    getAssignedOrders.mockRejectedValueOnce(new Error('network down'));

    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    expect(getAssignedOrders.mock.calls.length).toBeGreaterThan(1);
    expect(screen.getAllByRole('button', { name: 'Start' }).length).toBeGreaterThanOrEqual(2);
  });

  test('a rejected start is reported to the driver and does not start the simulator', async () => {
    startDelivery.mockRejectedValueOnce(new Error('Cannot start delivery for an order in status DELIVERED'));
    render(<Root />);
    const [startFirst] = await listStartButtons();

    userEvent.click(startFirst);

    expect(await screen.findByRole('alert')).toHaveTextContent('status DELIVERED');
    act(() => {
      jest.advanceTimersByTime(4000);
    });
    expect(publishLocation).not.toHaveBeenCalled();
  });

  test('the websocket is told the active order through the hook, not by reconnecting', async () => {
    render(<Root />);
    await listStartButtons();

    expect(useDriverWebSocket.mock.calls.some(([driverId, orderId]) => driverId === 'drv-1' && orderId === 'o-1')).toBe(true);
  });

  test('signing out tells the server which driver left', async () => {
    render(<Root />);
    await listStartButtons();

    userEvent.click(screen.getByRole('button', { name: 'Sign Out' }));

    await waitFor(() => expect(logout).toHaveBeenCalledWith('driver1@swift.lk'));
    expect(localStorage.getItem('driver_token')).toBeNull();
  });

  test('a stored session whose token does not match is discarded', async () => {
    localStorage.setItem('driver_token', 'some-other-token');

    render(<Root />);

    expect(await screen.findByText('Driver Login')).toBeInTheDocument();
    expect(localStorage.getItem('driver_details')).toBeNull();
  });
});
