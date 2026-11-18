import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreateOrderModal from './CreateOrderModal';

const fillAddress = () => {
  userEvent.type(screen.getByLabelText(/delivery address/i), '  42 Galle Road  ');
  userEvent.type(screen.getByLabelText(/^city/i), 'Colombo');
  userEvent.type(screen.getByLabelText(/postal code/i), '00300');
  userEvent.type(screen.getByLabelText(/country/i), 'Sri Lanka');
};

describe('CreateOrderModal', () => {
  test('submits trimmed values with a numeric amount', async () => {
    const onCreate = jest.fn().mockResolvedValue(undefined);
    render(<CreateOrderModal onClose={jest.fn()} onCreate={onCreate} />);
    fillAddress();

    userEvent.click(screen.getByRole('button', { name: 'Create Order' }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate).toHaveBeenCalledWith({
      deliveryAddress: '42 Galle Road',
      city: 'Colombo',
      postalCode: '00300',
      country: 'Sri Lanka',
      totalAmount: 18500,
    });
  });

  test('a double click creates exactly one order and the button is disabled while pending', async () => {
    let finish;
    const onCreate = jest.fn(() => new Promise((resolve) => { finish = resolve; }));
    render(<CreateOrderModal onClose={jest.fn()} onCreate={onCreate} />);
    fillAddress();
    const submit = screen.getByRole('button', { name: 'Create Order' });

    userEvent.dblClick(submit);

    expect(onCreate).toHaveBeenCalledTimes(1);
    const pending = await screen.findByRole('button', { name: 'Creating...' });
    expect(pending).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    finish();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create Order' })).toBeEnabled());
  });

  test('the form is invalid until required fields are filled (browsers block submission on that)', () => {
    const { container } = render(<CreateOrderModal onClose={jest.fn()} onCreate={jest.fn()} />);
    const form = container.querySelector('form');

    expect(form).not.toBeNull();
    expect(form.checkValidity()).toBe(false);

    fillAddress();
    expect(form.checkValidity()).toBe(true);

    userEvent.clear(container.querySelector('input[name="totalAmount"]'));
    userEvent.type(container.querySelector('input[name="totalAmount"]'), '0');
    expect(form.checkValidity()).toBe(false); // amount must be at least 0.01
  });

  test('the submit button is a real submit button; cancel is not', () => {
    render(<CreateOrderModal onClose={jest.fn()} onCreate={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Create Order' })).toHaveAttribute('type', 'submit');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveAttribute('type', 'button');
  });

  test('a quick-fill preset fills the form', async () => {
    const onCreate = jest.fn().mockResolvedValue(undefined);
    render(<CreateOrderModal onClose={jest.fn()} onCreate={onCreate} />);

    userEvent.click(screen.getByRole('button', { name: /Kandy/ }));
    userEvent.click(screen.getByRole('button', { name: 'Create Order' }));

    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    expect(onCreate.mock.calls[0][0]).toMatchObject({ city: 'Kandy', totalAmount: 35000 });
  });
});
