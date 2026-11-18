import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { orderEndpoints } from './network/order';

jest.mock('./components/LiveDeliveryMap', () => ({ __esModule: true, default: () => <div data-testid="map" /> }));
jest.mock('./network/order', () => ({
  orderEndpoints: {
    getOrders: jest.fn(),
    getOrderEvents: jest.fn(),
    trackOrder: jest.fn(),
    createOrder: jest.fn(),
    checkHealth: jest.fn(),
    replayDlq: jest.fn(),
  },
}));

const CUSTOMER = { customerId: 'cust-1', customerName: 'Eve', customerEmail: 'eve@example.com', token: 'jwt' };
const ORDERS = [
  { orderId: 'o-1', status: 'DELIVERED', deliveryAddress: '42 Galle Road', city: 'Colombo', totalAmount: 18500 },
  { orderId: 'o-2', status: 'IN_TRANSIT', deliveryAddress: '15 Bauddhaloka Mawatha', city: 'Colombo', totalAmount: 28000 },
];

const renderApp = () =>
  render(
    <AuthProvider>
      <App />
    </AuthProvider>
  );

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  orderEndpoints.getOrders.mockResolvedValue(ORDERS);
  orderEndpoints.getOrderEvents.mockResolvedValue([]);
  orderEndpoints.trackOrder.mockReturnValue({ close: jest.fn() });
});

describe('signed out', () => {
  test('shows the portal shell with no data and does not call the API', () => {
    renderApp();

    expect(screen.getByText('SwiftLogistics Portal')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign Up' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();
    expect(screen.getByText('0 Orders')).toBeInTheDocument();
    expect(screen.getByText('No Order Selected')).toBeInTheDocument();
    // No demo notifications for anonymous visitors.
    expect(screen.getByRole('button', { name: 'Show notifications' })).toBeInTheDocument();
    expect(orderEndpoints.getOrders).not.toHaveBeenCalled();
  });

  test('the sign-in dialog opens, is labelled, and closes with Escape', () => {
    renderApp();

    userEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    expect(screen.getByRole('dialog', { name: 'Sign In' })).toBeInTheDocument();

    userEvent.keyboard('{esc}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign In' })).toHaveFocus(); // focus returns to the opener
  });

  test('the create-order dialog opens from the header', () => {
    renderApp();

    userEvent.click(screen.getByRole('button', { name: '+ Create Order' }));

    expect(screen.getByRole('dialog', { name: 'Create New Order' })).toBeInTheDocument();
  });
});

describe('signed in', () => {
  beforeEach(() => {
    localStorage.setItem('swiftlogistics_customer', JSON.stringify(CUSTOMER));
  });

  test('loads the customer\'s orders, selects the first, and shows live KPIs', async () => {
    renderApp();

    expect(await screen.findByRole('button', { name: /Order o-1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Order o-2/ })).toBeInTheDocument();
    expect(orderEndpoints.getOrders).toHaveBeenCalledWith('cust-1');
    expect(screen.getByText('2 Orders')).toBeInTheDocument();
    expect(screen.getByText('1 Active')).toBeInTheDocument();
    expect(await screen.findByText('Order Details')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });

  test('selecting an order by keyboard shows its details', async () => {
    renderApp();
    const second = await screen.findByRole('button', { name: /Order o-2/ });

    second.focus();
    userEvent.keyboard('{enter}');

    await waitFor(() => expect(second).toHaveAttribute('aria-pressed', 'true'));
    expect(orderEndpoints.trackOrder).toHaveBeenLastCalledWith('o-2', expect.any(Function), expect.any(Function));
  });

  test('signing out clears orders and notifications', async () => {
    renderApp();
    await screen.findByRole('button', { name: /Order o-1/ });
    expect(screen.getByRole('button', { name: /unread/ })).toBeInTheDocument();

    userEvent.click(screen.getByRole('button', { name: 'Logout' }));

    expect(await screen.findByText('0 Orders')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Order o-1/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show notifications' })).toBeInTheDocument();
    expect(localStorage.getItem('swiftlogistics_customer')).toBeNull();
  });

  test('polling stops once every order is finished', async () => {
    jest.useFakeTimers();
    try {
      orderEndpoints.getOrders.mockResolvedValue([ORDERS[0]]); // delivered only
      renderApp();
      await screen.findByRole('button', { name: /Order o-1/ }); // the first response has been rendered

      await React.act(async () => {
        jest.advanceTimersByTime(20000);
      });

      expect(orderEndpoints.getOrders).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test('polling continues every 4 seconds while an order is in progress', async () => {
    jest.useFakeTimers();
    try {
      renderApp();
      await screen.findByRole('button', { name: /Order o-2/ }); // an order is in progress, so the timer is armed

      await React.act(async () => {
        jest.advanceTimersByTime(4000);
      });

      expect(orderEndpoints.getOrders).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
});
