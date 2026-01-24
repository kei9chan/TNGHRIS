import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Ticket, TicketCategory, TicketPriority, TicketStatus, User, ChatMessage } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import { mockBusinessUnits } from '../../services/mockData';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';
import FileUploader from '../ui/FileUploader';
import Card from '../ui/Card';
import ChatThread from '../feedback/ChatThread';
import { supabase } from '../../services/supabaseClient';

interface TicketAccess {
  canSubmit: boolean;
  canRespond: boolean;
  canView: boolean;
  scope: 'global' | 'bu' | 'self' | 'none';
}

interface TicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticket: Partial<Ticket> | null;
  onSave: (ticket: Partial<Ticket>) => void;
  onSendMessage: (text: string) => void;
  onResolve: (ticketId: string) => void;
  onApproveResolution: (ticketId: string) => void;
  onRejectResolution: (ticketId: string) => void;
  access: TicketAccess;
}

const TicketModal: React.FC<TicketModalProps> = ({ isOpen, onClose, ticket, onSave, onSendMessage, onResolve, onApproveResolution, onRejectResolution, access }) => {
  const { user } = useAuth();
  const [currentTicket, setCurrentTicket] = useState<Partial<Ticket>>(ticket || {});
  const [attachmentLink, setAttachmentLink] = useState('');
  const [attachmentPreviews, setAttachmentPreviews] = useState<{ path: string; url: string }[]>([]);
  const [assignees, setAssignees] = useState<User[]>([]);

  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [isAssigneeDropdownOpen, setAssigneeDropdownOpen] = useState(false);
  const assigneeRef = useRef<HTMLDivElement>(null);
  const initializedKeyRef = useRef<string | null>(null);
  const prevOpenRef = useRef<boolean>(false);
  const isNewTicket = !ticket?.id;
  const canSubmit = access.canSubmit;
  const canRespond = access.canRespond;

  useEffect(() => {
    // Track open/close transitions to avoid resetting while modal stays open
    const key = ticket?.id || 'new';
    const justOpened = isOpen && !prevOpenRef.current;
    const justClosed = !isOpen && prevOpenRef.current;

    if (justClosed) {
        prevOpenRef.current = false;
        initializedKeyRef.current = null;
        return;
    }

    if (!justOpened) return;

    if (initializedKeyRef.current === key) {
        // Already initialized for this ticket while open
        prevOpenRef.current = true;
        return;
    }

    initializedKeyRef.current = key;
    prevOpenRef.current = true;

    // Load assignee list from Supabase
    supabase
      .from('hris_users')
      .select('id, full_name, role, department, business_unit, business_unit_id, position, email')
      .order('full_name', { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.warn('Failed to load assignees', error);
          return;
        }
        if (data) {
          setAssignees(data.map((u: any) => ({
            id: u.id,
            name: u.full_name || 'User',
            email: u.email || '',
            role: u.role,
            department: u.department || '',
            businessUnit: u.business_unit || '',
            businessUnitId: u.business_unit_id || undefined,
            status: 'Active',
            isPhotoEnrolled: false,
            dateHired: new Date(),
            position: u.position || '',
          })));
        }
      })
      .catch((err) => console.warn('Assignee fetch error', err));

    const initialTicket = ticket || {
      requesterId: user?.id,
      requesterName: user?.name,
      category: TicketCategory.IT,
      priority: TicketPriority.Medium,
      status: TicketStatus.New,
      createdAt: new Date(),
      chatThread: [],
      businessUnitId: mockBusinessUnits[0]?.id || ''
    };
    setCurrentTicket(initialTicket);
    setAttachmentLink('');
    setAssigneeSearch(initialTicket.assignedToName || '');
    setAttachmentPreviews([]);

    // Build signed URLs for existing attachments
    if (ticket?.attachments && ticket.attachments.length > 0) {
      Promise.all(
        ticket.attachments.map(async (path) => {
          const { data, error } = await supabase.storage
            .from('ticket_attachments')
            .createSignedUrl(path, 60 * 60);
          return !error && data?.signedUrl ? { path, url: data.signedUrl } : null;
        })
      ).then(results => {
        setAttachmentPreviews(results.filter(Boolean) as { path: string; url: string }[]);
      }).catch(() => {});
    }
  }, [ticket, isOpen, user]);

  // Keep in-sync with latest ticket updates (chat/status) while modal stays open
  useEffect(() => {
    if (!isOpen || !ticket?.id) return;
    if (initializedKeyRef.current !== (ticket.id || 'new')) return;
    setCurrentTicket(prev => {
      if (!prev.id || prev.id !== ticket.id) return prev;
      return {
        ...prev,
        status: ticket.status ?? prev.status,
        chatThread: ticket.chatThread ?? prev.chatThread,
        assignedToId: ticket.assignedToId ?? prev.assignedToId,
        assignedToName: ticket.assignedToName ?? prev.assignedToName,
        resolvedAt: ticket.resolvedAt ?? prev.resolvedAt,
        attachments: ticket.attachments ?? prev.attachments,
      };
    });
  }, [ticket, isOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (assigneeRef.current && !assigneeRef.current.contains(event.target as Node)) {
        setAssigneeDropdownOpen(false);
        setAssigneeSearch(currentTicket.assignedToName || '');
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [assigneeRef, currentTicket.assignedToName]);

  const isRequester = user?.id === currentTicket.requesterId;
  const isAssignee = user?.id === currentTicket.assignedToId;
  // Existing tickets: only requester can edit core fields; responders can manage status/assignee.
  const canEditFields = isNewTicket ? canSubmit : isRequester;
  const canEditAssignee = canRespond;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setCurrentTicket(prev => ({ ...prev, [name]: value }));
  };
  
  const handleFile = async (file: File) => {
    if (!user) {
      alert('You must be signed in to upload attachments.');
      return;
    }
    if (!canEditFields) {
      alert('You do not have permission to modify attachments.');
      return;
    }
    const ext = file.name.split('.').pop() || 'bin';
    const key = `${user.id}/${crypto.randomUUID?.() || Date.now()}-${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from('ticket_attachments')
      .upload(key, file, { upsert: false });

    if (error) {
      alert(error.message || 'Failed to upload attachment.');
      return;
    }

    const { data } = await supabase.storage.from('ticket_attachments').createSignedUrl(key, 60 * 60);
    const signedUrl = data?.signedUrl || '';

    setAttachmentPreviews(prev => [...prev, { path: key, url: signedUrl }]);
    setCurrentTicket(prev => ({ ...prev, attachments: [...(prev.attachments || []), key] }));
  };

  const handleSave = () => {
    if (isNewTicket && !canSubmit) {
        alert('You do not have permission to submit tickets.');
        return;
    }
    if (!isNewTicket && !(canRespond || isRequester)) {
        alert('You do not have permission to update this ticket.');
        return;
    }
    const finalAttachments = [...(currentTicket.attachments || [])];
    if (attachmentLink.trim()) {
        finalAttachments.push(attachmentLink.trim());
    }
    
    const assignedUser = assignees.find(u => u.id === currentTicket.assignedToId);
    const payload: Partial<Ticket> = {
        ...currentTicket,
        attachments: finalAttachments.length > 0 ? finalAttachments : undefined,
        assignedToName: assignedUser?.name,
        ...(!currentTicket.id && { slaDeadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) })
    };
    onSave(payload);
  };

  const filteredAssignees = useMemo(() => {
    const lowerSearch = assigneeSearch.toLowerCase();
    const pool = assignees.length > 0 ? assignees : [];
    if (!lowerSearch) return pool;

    if (currentTicket.assignedToName && lowerSearch === currentTicket.assignedToName.toLowerCase()) {
        return pool.filter(u => u.name.toLowerCase().includes(lowerSearch) && u.id !== currentTicket.assignedToId);
    }

    return pool.filter(u => u.name.toLowerCase().includes(lowerSearch));
  }, [assigneeSearch, assignees, currentTicket.assignedToId, currentTicket.assignedToName]);

  const handleSelectAssignee = (user: User | null) => {
    setCurrentTicket(prev => ({
        ...prev,
        assignedToId: user?.id,
        assignedToName: user?.name,
    }));
    setAssigneeSearch(user?.name || '');
    setAssigneeDropdownOpen(false);
  };
  
  const renderFooter = () => {
      if (isNewTicket) {
          return (
            <div className="flex justify-end w-full space-x-2">
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
                <Button onClick={handleSave} disabled={!canSubmit}>Submit Ticket</Button>
            </div>
          );
      }

      if (canRespond && (currentTicket.status === TicketStatus.Assigned || currentTicket.status === TicketStatus.InProgress)) {
        return (
            <div className="flex justify-end w-full space-x-2">
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
                <Button onClick={handleSave}>Save Changes</Button>
                <Button variant="success" onClick={() => onResolve(currentTicket.id!)}>Mark as Resolved</Button>
            </div>
        );
      }
      
      if (isRequester && currentTicket.status === TicketStatus.PendingResolution) {
        return (
            <div className="flex justify-end w-full space-x-2">
                <Button variant="danger" onClick={() => onRejectResolution(currentTicket.id!)}>Resolution Not Accepted</Button>
                <Button variant="success" onClick={() => onApproveResolution(currentTicket.id!)}>Approve Resolution</Button>
            </div>
        );
      }
      
      if (canRespond && currentTicket.status !== TicketStatus.Resolved && currentTicket.status !== TicketStatus.Closed) {
           return (
            <div className="flex justify-end w-full space-x-2">
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
                <Button onClick={handleSave}>Save Changes</Button>
            </div>
          );
      }

      return <div className="flex justify-end w-full"><Button variant="secondary" onClick={onClose}>Close</Button></div>;
  }
  
  const canChat = currentTicket.id && user && (user.id === currentTicket.requesterId || user.id === currentTicket.assignedToId || canRespond);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isNewTicket ? 'Create New Helpdesk Ticket' : `Ticket: ${ticket?.id}`}
      footer={renderFooter()}
      size={currentTicket.status === TicketStatus.New ? "lg" : "4xl"}
    >
        <div className={`grid grid-cols-1 ${currentTicket.status !== TicketStatus.New ? 'md:grid-cols-2' : ''} gap-6`}>
            <div className="space-y-4">
                {!isNewTicket && (
                    <Card title="Requester Info">
                        <p><span className="font-semibold">Name:</span> {currentTicket.requesterName}</p>
                        <p><span className="font-semibold">Submitted:</span> {currentTicket.createdAt ? new Date(currentTicket.createdAt).toLocaleString() : 'N/A'}</p>
                    </Card>
                )}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label htmlFor="category" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Category</label>
                        <select id="category" name="category" value={currentTicket.category || ''} onChange={handleChange} disabled={!isNewTicket} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:bg-gray-200 dark:disabled:bg-gray-800">
                            {Object.values(TicketCategory).map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="priority" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Priority</label>
                        <select id="priority" name="priority" value={currentTicket.priority || ''} onChange={handleChange} disabled={!canEditFields} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:bg-gray-200 dark:disabled:bg-gray-800">
                            {Object.values(TicketPriority).map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="businessUnitId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Business Unit</label>
                        <select id="businessUnitId" name="businessUnitId" value={currentTicket.businessUnitId || ''} onChange={handleChange} disabled={!isNewTicket} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white disabled:bg-gray-200 dark:disabled:bg-gray-800">
                            <option value="" disabled>Select a BU</option>
                            {mockBusinessUnits.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
                        </select>
                    </div>
                </div>
                <Textarea label="Description" id="description" name="description" value={currentTicket.description || ''} onChange={handleChange} rows={5} required disabled={!canEditFields} />
                
                {isNewTicket ? (
                  <>
                    <FileUploader onFileUpload={handleFile} maxSize={2 * 1024 * 1024} />
                    <div className="relative my-2">
                        <div className="absolute inset-0 flex items-center" aria-hidden="true">
                            <div className="w-full border-t border-gray-300 dark:border-gray-600" />
                        </div>
                        <div className="relative flex justify-center">
                            <span className="bg-white dark:bg-slate-800 px-2 text-sm text-gray-500">
                            OR
                            </span>
                        </div>
                    </div>
                    <Input 
                        label="Add a link for supporting documents"
                        id="attachmentLink"
                        name="attachmentLink"
                        type="url"
                        placeholder="https://example.com/document"
                        value={attachmentLink}
                        onChange={(e) => setAttachmentLink(e.target.value)}
                    />
                    {attachmentPreviews.length > 0 && (
                      <div className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
                        <p className="font-semibold">Uploaded files:</p>
                        {attachmentPreviews.map(att => (
                          <div key={att.path}>
                            <a className="text-indigo-600 hover:underline" href={att.url} target="_blank" rel="noopener noreferrer">
                              {att.path.split('/').pop()}
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                    <p className="font-semibold">Attachments</p>
                    {attachmentPreviews.length === 0 && <p>No attachments submitted.</p>}
                    {attachmentPreviews.map(att => (
                      <div key={att.path}>
                        <a className="text-indigo-600 hover:underline" href={att.url} target="_blank" rel="noopener noreferrer">
                          {att.path.split('/').pop()}
                        </a>
                      </div>
                    ))}
                  </div>
                )}

                {!isNewTicket && canRespond && (
                    <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Management</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="status" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                                <select id="status" name="status" value={currentTicket.status || ''} onChange={handleChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                                    {Object.values(TicketStatus).map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div className="relative" ref={assigneeRef}>
                                <Input
                                  label="Assign To"
                                  id="assignee-search"
                                  value={assigneeSearch}
                                  onChange={(e) => {
                                    setAssigneeSearch(e.target.value);
                                    if (!isAssigneeDropdownOpen) setAssigneeDropdownOpen(true);
                                  }}
                                  onFocus={() => setAssigneeDropdownOpen(true)}
                                  autoComplete="off"
                                  placeholder="Search by name..."
                                />
                                {isAssigneeDropdownOpen && (
                                  <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-md shadow-lg max-h-48 overflow-y-auto">
                                    <div onClick={() => handleSelectAssignee(null)} className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-gray-500 italic">
                                      Unassigned
                                    </div>
                                    {filteredAssignees.map(u => (
                                      <div key={u.id} onClick={() => handleSelectAssignee(u)} className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                                        <p className="text-sm font-medium">{u.name}</p>
                                        <p className="text-xs text-gray-500">{u.role}</p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
            <div>
                {currentTicket.status && currentTicket.status !== TicketStatus.New && (
                    <ChatThread
                        messages={currentTicket.chatThread || []}
                        onSendMessage={onSendMessage}
                        disabled={!canChat}
                    />
                )}
            </div>
        </div>
    </Modal>
  );
};

export default TicketModal;
