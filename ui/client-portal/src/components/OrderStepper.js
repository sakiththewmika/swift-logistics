import React from 'react';
import {
  Check,
  AlertTriangle,
  RotateCcw,
  CreditCard,
  Package,
  Navigation,
  Truck,
  CheckCircle2,
  Clock,
  XCircle
} from 'lucide-react';

const STAGES = [
  { id: 1, label: 'Order Placed', code: 'NEW', tier: 'Orchestrator', icon: Package },
  { id: 2, label: 'Billing Verified', code: 'CMS', tier: 'CMS SOAP', icon: CreditCard },
  { id: 3, label: 'Warehouse Packed', code: 'WMS', tier: 'WMS TCP', icon: Package },
  { id: 4, label: 'Route Optimized', code: 'ROS', tier: 'ROS REST', icon: Navigation },
  { id: 5, label: 'Out for Delivery', code: 'DRIVER', tier: 'Driver App', icon: Truck },
  { id: 6, label: 'Delivered', code: 'POD', tier: 'Handover POD', icon: CheckCircle2 },
];

export const getStageProgress = (status) => {
  switch (status) {
    case 'NEW':
    case 'PENDING':
    case 'ORDER_CREATED':
      return { stageIndex: 1, isFailure: false, isSaga: false };
    case 'BILLING_PENDING':
      return { stageIndex: 2, isFailure: false, isSaga: false };
    case 'BILLED':
      return { stageIndex: 3, isFailure: false, isSaga: false };
    case 'PROCESSING':
      return { stageIndex: 3, isFailure: false, isSaga: false };
    case 'READY':
    case 'PACKED':
      return { stageIndex: 4, isFailure: false, isSaga: false };
    case 'ROUTING':
      return { stageIndex: 4, isFailure: false, isSaga: false };
    case 'ROUTED':
    case 'ASSIGNED':
    case 'DISPATCHED':
      return { stageIndex: 5, isFailure: false, isSaga: false };
    case 'IN_TRANSIT':
    case 'IN_PROGRESS':
      return { stageIndex: 5, isFailure: false, isSaga: false };
    case 'DELIVERED':
    case 'COMPLETED':
      return { stageIndex: 6, isFailure: false, isSaga: false, isCompleted: true };

    // Saga Failure & Rollback states
    case 'BILLING_FAILED':
      return {
        stageIndex: 2,
        isFailure: true,
        isSaga: true,
        bannerTitle: 'Saga Failure: Payment Verification Failed',
        bannerMessage: 'Payment authorization was rejected by the legacy CMS SOAP Service. The transaction was stopped before inventory reservation.',
      };
    case 'WAREHOUSE_FAILED':
      return {
        stageIndex: 3,
        isFailure: true,
        isSaga: true,
        bannerTitle: 'Saga Compensation: Warehouse Allocation Failed',
        bannerMessage: 'Item packaging or inventory check failed at WMS. Automatic Saga compensation triggered: refund requested from CMS.',
      };
    case 'COMPENSATING_BILLING':
      return {
        stageIndex: 2,
        isFailure: true,
        isSaga: true,
        bannerTitle: 'Saga Compensation in Progress: CMS Refund',
        bannerMessage: 'Refunding customer charge via CMS SOAP Service due to downstream warehouse fulfillment failure.',
      };
    case 'COMPENSATING_WAREHOUSE':
      return {
        stageIndex: 3,
        isFailure: true,
        isSaga: true,
        bannerTitle: 'Saga Compensation in Progress: WMS Rollback',
        bannerMessage: 'Releasing reserved package in WMS TCP Gateway due to route failure.',
      };
    case 'ROUTE_FAILED':
      return {
        stageIndex: 4,
        isFailure: true,
        isSaga: true,
        bannerTitle: 'Saga Failure: Route Planning Failed',
        bannerMessage: 'Route optimization service (ROS) was unable to schedule a vehicle. Rollback compensation initiated across warehouse and billing tiers.',
      };
    case 'CANCELLED_REFUNDED':
      return {
        stageIndex: 2,
        isFailure: true,
        isSaga: true,
        bannerTitle: 'Saga Rollback Completed: Order Cancelled & Refunded',
        bannerMessage: 'All distributed transactions across CMS, WMS, and ROS have been successfully rolled back. Customer has been fully refunded.',
      };
    case 'FAILED':
      return {
        stageIndex: 5,
        isFailure: true,
        isSaga: false,
        bannerTitle: 'Delivery Attempt Failed',
        bannerMessage: 'The driver reported that this delivery could not be completed.',
      };
    default:
      return { stageIndex: 1, isFailure: false, isSaga: false };
  }
};

const OrderStepper = ({ status, failureReason, deliveryNotes }) => {
  const progress = getStageProgress(status);
  const { stageIndex, isFailure, isSaga, isCompleted, bannerTitle, bannerMessage } = progress;

  return (
    <div style={{ margin: '20px 0 24px' }}>
      {/* Saga Compensation & Rollback Alert Banner */}
      {(isSaga || isFailure) && (
        <div
          style={{
            marginBottom: 20,
            padding: '14px 16px',
            backgroundColor: isSaga ? '#fffbeb' : '#fef2f2',
            border: `1px solid ${isSaga ? '#fde68a' : '#fca5a5'}`,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
          }}
        >
          {isSaga ? (
            <RotateCcw size={22} color="#b45309" style={{ marginTop: 2, flexShrink: 0 }} />
          ) : (
            <AlertTriangle size={22} color="#dc2626" style={{ marginTop: 2, flexShrink: 0 }} />
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: isSaga ? '#92400e' : '#991b1b', marginBottom: 2 }}>
              {bannerTitle || 'Saga Compensation Alert'}
            </div>
            <div style={{ fontSize: 13, color: isSaga ? '#78350f' : '#7f1d1d', lineHeight: 1.4 }}>
              {bannerMessage}
            </div>
            {failureReason && (
              <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: '#991b1b' }}>
                Incident Details: {failureReason}
              </div>
            )}
            {deliveryNotes && (
              <div style={{ marginTop: 4, fontSize: 12, color: '#475569' }}>
                Driver Notes: {deliveryNotes}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stepper Progress Bar */}
      <div style={{ position: 'relative' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1fr)',
            gap: 8,
            alignItems: 'flex-start',
          }}
        >
          {STAGES.map((stage, idx) => {
            const stepNum = stage.id;
            const isStepCompleted = isCompleted || stepNum < stageIndex;
            const isCurrentStep = stepNum === stageIndex;
            const isCurrentFailed = isCurrentStep && (isFailure || isSaga);
            const Icon = stage.icon;

            // Connector line to next stage
            const hasNextLine = idx < STAGES.length - 1;
            const isLineActive = stepNum < stageIndex;

            return (
              <div key={stage.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                {/* Horizontal line between steps */}
                {hasNextLine && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 18,
                      left: '50%',
                      width: '100%',
                      height: 3,
                      backgroundColor: isLineActive ? '#10b981' : isCurrentFailed ? '#fca5a5' : '#e2e8f0',
                      zIndex: 0,
                    }}
                  />
                )}

                {/* Step Circle Node */}
                <div
                  style={{
                    position: 'relative',
                    zIndex: 1,
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s ease',
                    backgroundColor: isCurrentFailed
                      ? '#ef4444'
                      : isStepCompleted
                      ? '#10b981'
                      : isCurrentStep
                      ? '#2563eb'
                      : '#f1f5f9',
                    color: isStepCompleted || isCurrentStep || isCurrentFailed ? '#ffffff' : '#94a3b8',
                    border: isCurrentFailed
                      ? '3px solid #fecaca'
                      : isCurrentStep
                      ? '3px solid #bfdbfe'
                      : isStepCompleted
                      ? '2px solid #10b981'
                      : '2px solid #cbd5e1',
                    boxShadow: isCurrentStep ? '0 0 0 4px rgba(37, 99, 235, 0.15)' : 'none',
                  }}
                >
                  {isCurrentFailed ? (
                    <XCircle size={18} />
                  ) : isStepCompleted ? (
                    <Check size={18} strokeWidth={2.5} />
                  ) : isCurrentStep ? (
                    <Icon size={17} />
                  ) : (
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{stepNum}</span>
                  )}
                </div>

                {/* Stage Labels */}
                <div style={{ textAlign: 'center', marginTop: 8, padding: '0 2px' }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: isCurrentStep || isStepCompleted ? 600 : 500,
                      color: isCurrentFailed
                        ? '#dc2626'
                        : isCurrentStep
                        ? '#1d4ed8'
                        : isStepCompleted
                        ? '#0f172a'
                        : '#94a3b8',
                      lineHeight: 1.2,
                    }}
                  >
                    {stage.label}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      marginTop: 3,
                      padding: '1px 5px',
                      borderRadius: 4,
                      display: 'inline-block',
                      backgroundColor: isCurrentStep ? '#eff6ff' : '#f8fafc',
                      color: isCurrentStep ? '#2563eb' : '#64748b',
                      border: '1px solid #e2e8f0',
                      fontWeight: 500,
                    }}
                  >
                    {stage.tier}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default OrderStepper;
