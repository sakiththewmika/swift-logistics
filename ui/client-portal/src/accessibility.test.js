import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Toast from './components/Toast';
import NotificationList from './components/NotificationList';
import NotificationBell from './components/NotificationBell';
import OrderList from './components/OrderList';
import CreateOrderModal from './components/CreateOrderModal';
import SignInModal from './components/SignInModal';
import SignUpModal from './components/SignUpModal';
import { AuthProvider } from './context/AuthContext';

const escape = () => fireEvent.keyDown(document, { key: 'Escape' });

describe('Toast', () => {
  test('is a polite live region even when empty, so announcements are not missed', () => {
    const { rerender } = render(<Toast toasts={[]} onDismiss={jest.fn()} />);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');

    rerender(<Toast toasts={[{ id: 1, title: 'Order Created', message: 'Submitted', type: 'success' }]} onDismiss={jest.fn()} />);

    expect(screen.getByRole('status')).toHaveTextContent('Order Created');
  });
});

describe('notifications', () => {
  test('the close button is named and Escape closes the list', () => {
    const onClose = jest.fn();
    render(<NotificationList notifications={[]} onClose={onClose} onMarkAllRead={jest.fn()} />);

    userEvent.click(screen.getByRole('button', { name: 'Close notifications' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    escape();
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('region', { name: 'Notifications' })).toBeInTheDocument();
  });

  test('items can be activated from the keyboard', () => {
    const onSelect = jest.fn();
    const items = [{ id: 1, message: 'Order o-1 shipped', time: 'now', read: false }];
    render(<NotificationList notifications={items} onClose={jest.fn()} onSelectNotification={onSelect} />);

    const item = screen.getByRole('button', { name: /Order o-1 shipped/ });
    item.focus();
    userEvent.keyboard('{enter}');

    expect(onSelect).toHaveBeenCalledWith(items[0]);
  });

  test('the bell announces its state and unread count', () => {
    const { rerender } = render(<NotificationBell unreadCount={0} onClick={jest.fn()} expanded={false} />);
    expect(screen.getByRole('button', { name: 'Show notifications' })).toHaveAttribute('aria-expanded', 'false');

    rerender(<NotificationBell unreadCount={3} onClick={jest.fn()} expanded />);

    const bell = screen.getByRole('button', { name: 'Show notifications (3 unread)' });
    expect(bell).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('OrderList keyboard access', () => {
  const orders = [
    { orderId: 'o-1', status: 'NEW', deliveryAddress: '1 First Street' },
    { orderId: 'o-2', status: 'ROUTED', deliveryAddress: '2 Second Street' },
  ];
  const renderList = (onSelect = jest.fn(), selected = null) =>
    render(
      <OrderList
        orders={orders}
        onSelect={onSelect}
        selectedOrder={selected}
        getStatusColor={() => ({})}
        getStatusIcon={() => null}
        formatStatus={(s) => s}
      />
    );

  test('cards are focusable buttons that Enter and Space activate', () => {
    const onSelect = jest.fn();
    renderList(onSelect);
    const card = screen.getByRole('button', { name: 'Order o-2, ROUTED' });

    expect(card).toHaveAttribute('tabindex', '0');
    card.focus();
    userEvent.keyboard('{enter}');
    userEvent.keyboard(' ');

    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenCalledWith(orders[1]);
  });

  test('the selected card is exposed as pressed', () => {
    renderList(jest.fn(), orders[0]);

    expect(screen.getByRole('button', { name: /Order o-1/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Order o-2/ })).toHaveAttribute('aria-pressed', 'false');
  });

  test('the search box has a name and does not suppress its focus outline inline', () => {
    renderList();
    const search = screen.getByRole('searchbox', { name: 'Search orders' });

    expect(search).toHaveClass('order-search-input');
    expect(search.style.outline).toBe('');
  });
});

describe('modal dialogs', () => {
  const wrap = (ui) => <AuthProvider>{ui}</AuthProvider>;

  test.each([
    ['sign in', (onClose) => wrap(<SignInModal onClose={onClose} />), 'Sign In'],
    ['sign up', (onClose) => wrap(<SignUpModal onClose={onClose} />), 'Sign Up'],
    ['create order', (onClose) => <CreateOrderModal onClose={onClose} onCreate={jest.fn()} />, 'Create New Order'],
  ])('%s is a labelled modal dialog that Escape closes', (_name, build, title) => {
    const onClose = jest.fn();
    render(build(onClose));

    const dialog = screen.getByRole('dialog', { name: title });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveFocus();

    escape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('Escape is ignored while an order is being submitted', async () => {
    const onClose = jest.fn();
    let finish;
    const onCreate = jest.fn(() => new Promise((resolve) => { finish = resolve; }));
    render(<CreateOrderModal onClose={onClose} onCreate={onCreate} />);
    userEvent.type(screen.getByLabelText(/delivery address/i), '1 Street');
    userEvent.type(screen.getByLabelText(/^city/i), 'Colombo');
    userEvent.type(screen.getByLabelText(/postal code/i), '00300');
    userEvent.type(screen.getByLabelText(/country/i), 'Sri Lanka');
    userEvent.click(screen.getByRole('button', { name: 'Create Order' }));

    await screen.findByRole('button', { name: 'Creating...' });
    escape();
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => finish());
    escape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
