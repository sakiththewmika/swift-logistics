import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SystemOpsModal from './SystemOpsModal';
import { orderEndpoints } from '../network/order';
import { useAuth } from '../context/AuthContext';

jest.mock('../network/order', () => ({
  orderEndpoints: {
    checkHealth: jest.fn(),
    createOrder: jest.fn(),
    replayDlq: jest.fn(),
  },
}));
jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));

describe('SystemOpsModal under JWT enforcement', () => {
  let signin;

  beforeEach(() => {
    jest.clearAllMocks();
    signin = jest.fn().mockResolvedValue({ customerId: 'cust-001', token: 'jwt' });
    orderEndpoints.checkHealth.mockResolvedValue({ status: 'UP' });
    orderEndpoints.createOrder.mockResolvedValue({ orderId: 'o-1', status: 'NEW', totalAmount: 95000 });
    orderEndpoints.replayDlq.mockResolvedValue({ replayed: 3 });
  });

  const signedOut = () => useAuth.mockReturnValue({ isAuthenticated: false, signin, getCustomerId: () => null });
  const signedIn = (id) => useAuth.mockReturnValue({ isAuthenticated: true, signin, getCustomerId: () => id });

  test('signs in as the demo customer before a scenario when nobody is signed in', async () => {
    signedOut();
    render(<SystemOpsModal onClose={jest.fn()} onOrderCreated={jest.fn()} />);

    userEvent.click(screen.getByRole('button', { name: /Launch Happy Path/ }));

    await waitFor(() => expect(orderEndpoints.createOrder).toHaveBeenCalledTimes(1));
    expect(signin).toHaveBeenCalledWith('client@swift.lk', 'password123');
    // The token must exist before the request is fired.
    expect(signin.mock.invocationCallOrder[0]).toBeLessThan(orderEndpoints.createOrder.mock.invocationCallOrder[0]);
    expect(orderEndpoints.createOrder.mock.calls[0][0].customerId).toBe('cust-001');
  });

  test('keeps the signed-in customer identity and does not sign in again', async () => {
    signedIn('cust-777');
    render(<SystemOpsModal onClose={jest.fn()} onOrderCreated={jest.fn()} />);

    userEvent.click(screen.getByRole('button', { name: /Launch Happy Path/ }));

    await waitFor(() => expect(orderEndpoints.createOrder).toHaveBeenCalled());
    expect(signin).not.toHaveBeenCalled();
    expect(orderEndpoints.createOrder.mock.calls[0][0].customerId).toBe('cust-777');
  });

  test('the rollback scenario still sends the [FAIL_ROUTE] trigger', async () => {
    signedOut();
    render(<SystemOpsModal onClose={jest.fn()} onOrderCreated={jest.fn()} />);

    userEvent.click(screen.getByRole('button', { name: /Run Rollback Test/ }));

    await waitFor(() => expect(orderEndpoints.createOrder).toHaveBeenCalled());
    expect(orderEndpoints.createOrder.mock.calls[0][0].deliveryAddress).toContain('[FAIL_ROUTE]');
  });

  test('DLQ replay signs in first when signed out', async () => {
    signedOut();
    render(<SystemOpsModal onClose={jest.fn()} onOrderCreated={jest.fn()} />);

    userEvent.click(screen.getByRole('button', { name: /Dead-Letter Queue \(DLQ\) Replay/ }));
    userEvent.click(screen.getByRole('button', { name: /Replay Dead-Letter Messages/ }));

    await waitFor(() => expect(orderEndpoints.replayDlq).toHaveBeenCalledWith('order-created.dlq', 10));
    expect(signin.mock.invocationCallOrder[0]).toBeLessThan(orderEndpoints.replayDlq.mock.invocationCallOrder[0]);
  });

  test('a failed demo sign-in is reported and no request is sent', async () => {
    signedOut();
    signin.mockRejectedValue(new Error('Invalid credentials'));
    render(<SystemOpsModal onClose={jest.fn()} onOrderCreated={jest.fn()} />);

    userEvent.click(screen.getByRole('button', { name: /Launch Happy Path/ }));

    expect(await screen.findByText(/Could not sign in as the demo customer: Invalid credentials/)).toBeInTheDocument();
    expect(orderEndpoints.createOrder).not.toHaveBeenCalled();
  });
});
