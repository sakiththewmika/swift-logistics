import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

jest.mock('./network/auth', () => ({ login: jest.fn(), signup: jest.fn(), logout: jest.fn() }));
jest.mock('./network/driver', () => ({
  getAssignedOrders: jest.fn().mockResolvedValue([]),
  startDelivery: jest.fn(),
  submitProofOfDelivery: jest.fn(),
}));

beforeEach(() => {
  localStorage.clear();
});

describe('driver app when signed out', () => {
  test('shows the login form', () => {
    render(<App />);

    expect(screen.getByText('Driver Login')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Username')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log In' })).toBeInTheDocument();
  });

  test('the demo button fills the credentials', () => {
    render(<App />);

    userEvent.click(screen.getByRole('button', { name: 'Fill Demo Driver' }));

    expect(screen.getByPlaceholderText('Username')).toHaveValue('driver1@swift.lk');
    expect(screen.getByPlaceholderText('Password')).toHaveValue('password123');
  });

  test('empty credentials are rejected before any request', () => {
    render(<App />);

    userEvent.click(screen.getByRole('button', { name: 'Log In' }));

    expect(screen.getByText('Username and password are required.')).toBeInTheDocument();
  });

  test('sign-up asks for a text vehicle type and validates the password confirmation', () => {
    render(<App />);
    userEvent.click(screen.getByRole('button', { name: 'Sign Up' }));

    expect(screen.getByText('Driver Sign Up')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Vehicle Type')).toHaveAttribute('type', 'text');

    userEvent.type(screen.getByPlaceholderText('Username'), 'new.driver');
    userEvent.type(screen.getByPlaceholderText('Vehicle Number'), 'WP CAB-9');
    userEvent.type(screen.getByPlaceholderText('Vehicle Type'), 'VAN');
    userEvent.type(screen.getByPlaceholderText('Password'), 'secret123');
    userEvent.type(screen.getByPlaceholderText('Confirm Password'), 'different');
    userEvent.click(screen.getByRole('button', { name: 'Sign Up' }));

    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
  });

  test('can switch between login and sign-up', () => {
    render(<App />);

    userEvent.click(screen.getByRole('button', { name: 'Sign Up' }));
    userEvent.click(screen.getByRole('button', { name: 'Log In' }));

    expect(screen.getByText('Driver Login')).toBeInTheDocument();
  });
});
