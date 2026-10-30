import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, Image as ImageIcon, RotateCcw, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import '../AppStyles.css';

const ProofOfDeliveryModal = ({ delivery, initialMode = 'DELIVERED', onSubmit, onCancel }) => {
  const [signatureData, setSignatureData] = useState('');
  const [photoData, setPhotoData] = useState('');
  const [notes, setNotes] = useState('');
  const [failureReason, setFailureReason] = useState('');
  const [mode, setMode] = useState(initialMode); // 'DELIVERED' or 'FAILED'
  const [hasSignature, setHasSignature] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    if (initialMode) {
      setMode(initialMode);
    }
  }, [initialMode]);

  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle guide line
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(16, canvas.height - 30);
    ctx.lineTo(canvas.width - 16, canvas.height - 30);
    ctx.stroke();
    ctx.setLineDash([]);
  }, []);

  useEffect(() => {
    if (delivery && mode === 'DELIVERED') {
      setTimeout(initCanvas, 50);
    }
  }, [delivery, mode, initCanvas]);

  if (!delivery) return null;

  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches && e.touches.length > 0 ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches && e.touches.length > 0 ? e.touches[0].clientY : e.clientY;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e) => {
    const { x, y } = getCoordinates(e);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const { x, y } = getCoordinates(e);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      setSignatureData(canvas.toDataURL('image/png'));
    }
  };

  const clearSignature = () => {
    initCanvas();
    setSignatureData('');
    setHasSignature(false);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const maxWidth = 600;
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const offscreen = document.createElement('canvas');
        offscreen.width = width;
        offscreen.height = height;
        const octx = offscreen.getContext('2d');
        octx.drawImage(img, 0, 0, width, height);
        const resized = offscreen.toDataURL('image/jpeg', 0.85);
        setPhotoData(resized);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const generateSampleParcelPhoto = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');

    // Cardboard gradient
    const grad = ctx.createLinearGradient(0, 0, 400, 240);
    grad.addColorStop(0, '#d97706');
    grad.addColorStop(1, '#b45309');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 400, 240);

    // Packaging tape
    ctx.fillStyle = '#78350f';
    ctx.fillRect(0, 100, 400, 36);

    // Shipping label
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(40, 30, 320, 175);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 30, 320, 175);

    // Header strip
    ctx.fillStyle = '#2563eb';
    ctx.fillRect(40, 30, 320, 28);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('SWIFT LOGISTICS - PROOF OF DELIVERY', 52, 49);

    // Details
    const orderDisplay = delivery.id || delivery.orderId || 'ORD-COL-1002';
    const dest = delivery.deliveryAddress || delivery.city || 'Colombo, Sri Lanka';
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(`ORDER: ${orderDisplay}`, 52, 82);

    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#475569';
    ctx.fillText(`DEST: ${dest.length > 30 ? dest.slice(0, 30) + '...' : dest}`, 52, 104);
    ctx.fillText(`TIME: ${new Date().toLocaleTimeString()}`, 52, 124);

    ctx.fillStyle = '#16a34a';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('✓ Handover Verified at Destination', 52, 146);

    // Barcode
    ctx.fillStyle = '#0f172a';
    for (let i = 0; i < 28; i++) {
      const bw = i % 3 === 0 ? 3 : i % 2 === 0 ? 2 : 1;
      ctx.fillRect(52 + i * 9, 160, bw, 30);
    }

    setPhotoData(canvas.toDataURL('image/png'));
  };

  const submit = (status) => {
    onSubmit({
      status,
      signatureData: status === 'DELIVERED' ? signatureData : null,
      photoData: status === 'DELIVERED' ? photoData : null,
      notes,
      failureReason: status === 'FAILED' ? failureReason : null,
    });
  };

  const orderDisplayId = delivery.id || delivery.orderId || '';

  return (
    <div className="modal">
      <div className="modal-content" style={{ maxWidth: 460, maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <h3 className="modal-title" style={{ margin: 0 }}>Proof of Delivery (POD)</h3>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
              Order: <strong>{orderDisplayId}</strong> • {delivery.city || 'Colombo'}
            </p>
          </div>
          <button
            onClick={onCancel}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
            title="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Selector */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => setMode('DELIVERED')}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 6,
              border: mode === 'DELIVERED' ? '2px solid #10b981' : '1px solid #e2e8f0',
              background: mode === 'DELIVERED' ? '#ecfdf5' : '#ffffff',
              color: mode === 'DELIVERED' ? '#047857' : '#64748b',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              fontSize: 13,
            }}
          >
            <CheckCircle2 size={16} /> Mark Delivered
          </button>
          <button
            type="button"
            onClick={() => setMode('FAILED')}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 6,
              border: mode === 'FAILED' ? '2px solid #ef4444' : '1px solid #e2e8f0',
              background: mode === 'FAILED' ? '#fef2f2' : '#ffffff',
              color: mode === 'FAILED' ? '#b91c1c' : '#64748b',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              fontSize: 13,
            }}
          >
            <AlertTriangle size={16} /> Report Failed
          </button>
        </div>

        {mode === 'DELIVERED' ? (
          <div>
            {/* HTML5 Canvas Signature Pad */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>
                  Customer Signature <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {hasSignature && (
                    <span style={{ fontSize: 12, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <CheckCircle2 size={14} /> Captured
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={clearSignature}
                    style={{
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      borderRadius: 4,
                      padding: '3px 8px',
                      fontSize: 11,
                      color: '#475569',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <RotateCcw size={12} /> Clear
                  </button>
                </div>
              </div>
              <div
                style={{
                  border: '1px solid #cbd5e1',
                  borderRadius: 8,
                  overflow: 'hidden',
                  background: '#ffffff',
                  boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)',
                }}
              >
                <canvas
                  ref={canvasRef}
                  width={410}
                  height={130}
                  style={{
                    display: 'block',
                    width: '100%',
                    height: '130px',
                    touchAction: 'none',
                    cursor: 'crosshair',
                  }}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                />
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94a3b8' }}>
                Draw customer signature above using finger or mouse.
              </p>
            </div>

            {/* Delivery Photo Upload */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>
                  Delivery Photo
                </label>
                {photoData && (
                  <button
                    type="button"
                    onClick={() => setPhotoData('')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#ef4444',
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    Remove Photo
                  </button>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />

              {photoData ? (
                <div
                  style={{
                    border: '1px solid #cbd5e1',
                    borderRadius: 8,
                    overflow: 'hidden',
                    background: '#f8fafc',
                    position: 'relative',
                  }}
                >
                  <img
                    src={photoData}
                    alt="Delivery Parcel Preview"
                    style={{ width: '100%', maxHeight: 160, objectFit: 'contain', display: 'block' }}
                  />
                  <div
                    style={{
                      padding: '6px 12px',
                      background: 'rgba(15, 23, 42, 0.75)',
                      color: '#ffffff',
                      fontSize: 11,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>✓ Photo attached</span>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      style={{ background: 'none', border: 'none', color: '#93c5fd', cursor: 'pointer', fontSize: 11 }}
                    >
                      Change
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      background: '#f8fafc',
                      border: '1px dashed #cbd5e1',
                      borderRadius: 8,
                      color: '#334155',
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <Camera size={16} /> Take / Upload Photo
                  </button>
                  <button
                    type="button"
                    onClick={generateSampleParcelPhoto}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      background: '#eff6ff',
                      border: '1px dashed #93c5fd',
                      borderRadius: 8,
                      color: '#1d4ed8',
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                  >
                    <ImageIcon size={16} /> Use Sample Parcel Photo
                  </button>
                </div>
              )}
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                Delivery Notes
              </label>
              <textarea
                placeholder="E.g., Left with security, signed by Mr. Silva at reception"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                style={{
                  width: '100%',
                  padding: 8,
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  fontSize: 13,
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            <div className="modal-buttons">
              <button
                type="button"
                onClick={() => submit('DELIVERED')}
                className="modal-button modal-success-button"
              >
                Confirm Delivery (POD)
              </button>
              <button type="button" onClick={onCancel} className="modal-button modal-cancel-button">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div>
            {/* Failure Reason */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#b91c1c', marginBottom: 6 }}>
                Failure Reason <span style={{ color: '#ef4444' }}>*</span>
              </label>

              {/* Preset Failure Chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {[
                  'Recipient Unavailable',
                  'Incorrect Address',
                  'Damaged Parcel',
                  'Customer Refused Delivery',
                  'Access Blocked / Security',
                ].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setFailureReason(chip)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 12,
                      fontSize: 11,
                      fontWeight: failureReason === chip ? 600 : 500,
                      backgroundColor: failureReason === chip ? '#fee2e2' : '#f8fafc',
                      color: failureReason === chip ? '#991b1b' : '#64748b',
                      border: failureReason === chip ? '1px solid #f87171' : '1px solid #e2e8f0',
                      cursor: 'pointer',
                    }}
                  >
                    {chip}
                  </button>
                ))}
              </div>

              <select
                value={failureReason}
                onChange={(e) => setFailureReason(e.target.value)}
                style={{
                  width: '100%',
                  padding: 8,
                  borderRadius: 6,
                  border: '1px solid #fca5a5',
                  fontSize: 13,
                  marginBottom: 8,
                  boxSizing: 'border-box',
                }}
              >
                <option value="">-- Select reason --</option>
                <option value="Customer unavailable / No answer">Customer unavailable / No answer</option>
                <option value="Incorrect address / Location unreachable">Incorrect address / Location unreachable</option>
                <option value="Recipient refused delivery">Recipient refused delivery</option>
                <option value="Access blocked / Security refusal">Access blocked / Security refusal</option>
                <option value="Package damaged in transit">Package damaged in transit</option>
                <option value="Other">Other (specify below)</option>
              </select>
              <input
                type="text"
                placeholder="Or type specific failure details..."
                value={failureReason}
                onChange={(e) => setFailureReason(e.target.value)}
                style={{
                  width: '100%',
                  padding: 8,
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  fontSize: 13,
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                Driver Incident Notes
              </label>
              <textarea
                placeholder="Describe attempts made to contact customer..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                style={{
                  width: '100%',
                  padding: 8,
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  fontSize: 13,
                  boxSizing: 'border-box',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            <div className="modal-buttons">
              <button
                type="button"
                onClick={() => submit('FAILED')}
                className="modal-button modal-danger-button"
                disabled={!failureReason}
              >
                Report Delivery Failed
              </button>
              <button type="button" onClick={onCancel} className="modal-button modal-cancel-button">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProofOfDeliveryModal;
