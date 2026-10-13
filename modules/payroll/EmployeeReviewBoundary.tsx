import React from 'react';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';

// A bad legacy record or dialog error must not unmount payroll readiness.
export default class EmployeeReviewBoundary extends React.Component<{
 children: React.ReactNode; onClose: () => void;
}, {error: Error | null}> {
 state = {error: null as Error | null};
 static getDerivedStateFromError(error: Error) { return {error}; }
 componentDidCatch(error: Error, info: React.ErrorInfo) {
  console.error('Employee payroll review failed', error, info);
 }
 render() {
  if (!this.state.error) return this.props.children;
  return <Modal isOpen onClose={this.props.onClose} title="Employee review could not be opened" footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={this.props.onClose}>Close review</Button><Button onClick={() => this.setState({error:null})}>Retry review</Button></div>}>
   <p>The employee’s review was interrupted. Retry it, or close this panel to continue checking payroll readiness.</p>
   <details><summary className="cursor-pointer text-sm">Details for HR support</summary><p className="mt-2 break-words text-sm">{this.state.error.message}</p></details>
  </Modal>;
 }
}
