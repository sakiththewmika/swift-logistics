import React, { useState } from 'react';
import '../AppStyles.css';

const ProofOfDeliveryModal = ({ delivery, onSubmit, onCancel }) => {
  const [signatureData, setSignatureData] = useState('');
  const [photoData, setPhotoData] = useState('');
  const [notes, setNotes] = useState('');
  const [failureReason, setFailureReason] = useState('');

  if (!delivery) return null;

  const submit = status => onSubmit({
    status,
    signatureData: status === 'DELIVERED' ? signatureData : null,
    photoData: status === 'DELIVERED' ? photoData : null,
    notes,
    failureReason: status === 'FAILED' ? failureReason : null,
  });

  return (
    <div className="modal">
      <div className="modal-content">
        <h3 className="modal-title">Proof of Delivery</h3>
        <input placeholder="Customer signature data or URL" value={signatureData}
          onChange={event => setSignatureData(event.target.value)} />
        <input placeholder="Delivery photo data or URL" value={photoData}
          onChange={event => setPhotoData(event.target.value)} />
        <textarea placeholder="Notes" value={notes}
          onChange={event => setNotes(event.target.value)} />
        <input placeholder="Failure reason (required for failed delivery)"
          value={failureReason} onChange={event => setFailureReason(event.target.value)} />
        <div className="modal-buttons">
          <button onClick={() => submit('DELIVERED')} className="modal-button modal-success-button">
            Submit Delivered
          </button>
          <button onClick={() => submit('FAILED')} className="modal-button modal-danger-button">
            Submit Failed
          </button>
          <button onClick={onCancel} className="modal-button modal-cancel-button">Cancel</button>
        </div>
      </div>
    </div>
  );
};

export default ProofOfDeliveryModal;
