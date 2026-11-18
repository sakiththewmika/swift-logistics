import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProofOfDeliveryModal from './ProofOfDeliveryModal';

const SIGNATURE = 'data:image/png;base64,SIGNATURE';

let ctx;
let originalImage;

beforeEach(() => {
  ctx = {
    fillRect: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
    setLineDash: jest.fn(),
    drawImage: jest.fn(),
  };
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
  jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(SIGNATURE);
  originalImage = global.Image;
  // jsdom never loads images; make a data URL "load" immediately so repainting can be observed.
  global.Image = class {
    set src(value) {
      this._src = value;
      if (this.onload) this.onload();
    }
    get src() {
      return this._src;
    }
  };
});

afterEach(() => {
  global.Image = originalImage;
  jest.restoreAllMocks();
});

const delivery = (id) => ({ orderId: id, deliveryAddress: `${id} Road`, city: 'Colombo' });

const signature = () => {
  const canvas = document.querySelector('canvas');
  fireEvent.mouseDown(canvas, { clientX: 10, clientY: 10 });
  fireEvent.mouseMove(canvas, { clientX: 40, clientY: 30 });
  fireEvent.mouseUp(canvas);
};

const confirmButton = () => screen.getByRole('button', { name: /Confirm Delivery|Submitting/ });

describe('ProofOfDeliveryModal', () => {
  test('delivery cannot be confirmed without a signature', () => {
    const onSubmit = jest.fn();
    render(<ProofOfDeliveryModal delivery={delivery('o-1')} onSubmit={onSubmit} onCancel={jest.fn()} />);

    expect(confirmButton()).toBeDisabled();
    userEvent.click(confirmButton());
    expect(onSubmit).not.toHaveBeenCalled();

    signature();
    expect(confirmButton()).toBeEnabled();
  });

  test('submits the captured signature, photo-less, with notes', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(<ProofOfDeliveryModal delivery={delivery('o-1')} onSubmit={onSubmit} onCancel={jest.fn()} />);
    signature();
    userEvent.type(screen.getByPlaceholderText(/Left with security/), 'Left at reception');

    userEvent.click(confirmButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      status: 'DELIVERED',
      signatureData: SIGNATURE,
      photoData: null,
      notes: 'Left at reception',
      failureReason: null,
    });
  });

  test('a fresh mount for the next order starts with nothing carried over', () => {
    const { rerender } = render(
      <ProofOfDeliveryModal key="o-1" delivery={delivery('o-1')} onSubmit={jest.fn()} onCancel={jest.fn()} />
    );
    signature();
    userEvent.type(screen.getByPlaceholderText(/Left with security/), 'note for the first order');
    expect(confirmButton()).toBeEnabled();

    rerender(<ProofOfDeliveryModal key="o-2" delivery={delivery('o-2')} onSubmit={jest.fn()} onCancel={jest.fn()} />);

    expect(confirmButton()).toBeDisabled();
    expect(screen.getByPlaceholderText(/Left with security/)).toHaveValue('');
    expect(screen.queryByText('Captured')).not.toBeInTheDocument();
  });

  test('the signature survives switching to the failure tab and back, and is repainted', () => {
    render(<ProofOfDeliveryModal delivery={delivery('o-1')} onSubmit={jest.fn()} onCancel={jest.fn()} />);
    signature();
    ctx.drawImage.mockClear();

    userEvent.click(screen.getByRole('button', { name: /Report Failed/ }));
    expect(screen.getByRole('button', { name: /Report Delivery Failed/ })).toBeInTheDocument();
    userEvent.click(screen.getByRole('button', { name: /Mark Delivered/ }));

    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    expect(ctx.drawImage.mock.calls[0][0]._src).toBe(SIGNATURE);
    expect(screen.getByText('Captured')).toBeInTheDocument();
    expect(confirmButton()).toBeEnabled();
  });

  test('clearing the signature disables confirmation again', () => {
    render(<ProofOfDeliveryModal delivery={delivery('o-1')} onSubmit={jest.fn()} onCancel={jest.fn()} />);
    signature();

    userEvent.click(screen.getByRole('button', { name: /Clear/ }));

    expect(confirmButton()).toBeDisabled();
  });

  test('double clicks submit once; the button shows progress and is disabled meanwhile', async () => {
    let finish;
    const onSubmit = jest.fn(() => new Promise((resolve) => { finish = resolve; }));
    render(<ProofOfDeliveryModal delivery={delivery('o-1')} onSubmit={onSubmit} onCancel={jest.fn()} />);
    signature();

    userEvent.dblClick(confirmButton());

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: 'Submitting...' })).toBeDisabled();
    await act(async () => finish());
  });

  test('a rejected submission shows the reason and lets the driver retry', async () => {
    const onSubmit = jest.fn().mockRejectedValueOnce(new Error('Cannot submit proof of delivery for an order in status DELIVERED'));
    render(<ProofOfDeliveryModal delivery={delivery('o-1')} onSubmit={onSubmit} onCancel={jest.fn()} />);
    signature();

    userEvent.click(confirmButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('status DELIVERED');
    await waitFor(() => expect(confirmButton()).toBeEnabled());
  });

  test('reporting a failure needs a reason and sends only failure data', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(<ProofOfDeliveryModal delivery={delivery('o-1')} initialMode="FAILED" onSubmit={onSubmit} onCancel={jest.fn()} />);
    const report = screen.getByRole('button', { name: /Report Delivery Failed/ });
    expect(report).toBeDisabled();

    userEvent.click(screen.getByRole('button', { name: 'Damaged Parcel' }));
    expect(report).toBeEnabled();
    userEvent.click(report);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      status: 'FAILED',
      failureReason: 'Damaged Parcel',
      signatureData: null,
      photoData: null,
    });
  });

  test('opens in the requested mode', () => {
    render(<ProofOfDeliveryModal delivery={delivery('o-1')} initialMode="FAILED" onSubmit={jest.fn()} onCancel={jest.fn()} />);

    expect(screen.getByRole('button', { name: /Report Delivery Failed/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Confirm Delivery/ })).not.toBeInTheDocument();
  });
});
