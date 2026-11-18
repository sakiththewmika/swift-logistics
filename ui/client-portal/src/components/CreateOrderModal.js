import React, { useState } from 'react';
import useModalA11y from '../hooks/useModalA11y';

const initialState = () => ({
  deliveryAddress: '',
  city: '',
  postalCode: '',
  country: '',
  totalAmount: 18500
});

const CreateOrderModal = ({ onClose, onCreate }) => {
  const [form, setForm] = useState(initialState());
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useModalA11y(onClose, { enabled: !submitting });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return; // a second click or Enter press must not create a second order
    setSubmitting(true);
    try {
      await onCreate({
        ...form,
        deliveryAddress: form.deliveryAddress.trim(),
        city: form.city.trim(),
        postalCode: form.postalCode.trim(),
        country: form.country.trim(),
        totalAmount: Number(form.totalAmount),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const applyPreset = (preset) => setForm((previous) => ({ ...previous, ...preset }));

  const presets = [
    {
      label: 'Colombo 03 — Kollupitiya',
      deliveryAddress: '42 Galle Road, Colombo 03',
      city: 'Colombo',
      postalCode: '00300',
      country: 'Sri Lanka',
      totalAmount: 18500,
    },
    {
      label: 'Colombo 04 — Bambalapitiya',
      deliveryAddress: '15 Bauddhaloka Mawatha, Colombo 04',
      city: 'Colombo',
      postalCode: '00400',
      country: 'Sri Lanka',
      totalAmount: 28000,
    },
    {
      label: 'Kandy — Peradeniya Rd',
      deliveryAddress: '120 Peradeniya Road, Kandy',
      city: 'Kandy',
      postalCode: '20000',
      country: 'Sri Lanka',
      totalAmount: 35000,
    },
  ];

  return (
    <div className="modal-overlay">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-order-title"
        ref={dialogRef}
        tabIndex={-1}
      >
        <h2 id="create-order-title" style={{ marginTop: 0, marginBottom: 18, fontWeight: 600, fontSize: 22, color: '#1e293b' }}>Create New
          Order</h2>
        <form className="create-order-form" onSubmit={handleSubmit}>
          <div>
            <span style={{ display: 'block', marginBottom: 8 }}>Quick-fill destination</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {presets.map((preset) => (
                <button
                  type="button"
                  key={preset.label}
                  onClick={() => applyPreset(preset)}
                  style={{
                    padding: '7px 10px',
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    background: '#f8fafc',
                    color: '#334155',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span>Total Amount</span>
            <input
              type="number"
              name="totalAmount"
              min="0.01"
              step="0.01"
              value={form.totalAmount}
              onChange={handleChange}
              required
            />
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Amount in LKR</div>
          </div>
          <label>
            Delivery Address
            <input name="deliveryAddress" value={form.deliveryAddress} onChange={handleChange} required/>
          </label>
          <label>
            City
            <input name="city" value={form.city} onChange={handleChange} required/>
          </label>
          <label>
            Postal Code
            <input name="postalCode" value={form.postalCode} onChange={handleChange} required/>
          </label>
          <label>
            Country
            <input name="country" value={form.country} onChange={handleChange} required/>
          </label>
          <div className="modal-actions">
            <button type="button" onClick={onClose} disabled={submitting}>Cancel</button>
            <button type="submit" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateOrderModal;