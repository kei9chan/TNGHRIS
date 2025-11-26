import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';
import Card from '../ui/Card';

interface ChatThreadProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  disabled?: boolean;
}

const ChatThread: React.FC<ChatThreadProps> = ({ messages, onSendMessage, disabled = false }) => {
  const { user } = useAuth();
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  useEffect(scrollToBottom, [messages]);

  const handleSend = () => {
    if (newMessage.trim()) {
      onSendMessage(newMessage);
      setNewMessage('');
    }
  };

  return (
    <Card title="Chat Thread">
      <div className="space-y-4 max-h-64 overflow-y-auto pr-2">
        {messages.map(msg => (
          <div key={msg.id} className={`flex flex-col ${msg.userId === user?.id ? 'items-end' : 'items-start'}`}>
            <div className={`rounded-lg px-3 py-2 max-w-sm ${msg.userId === user?.id ? 'bg-indigo-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-200'}`}>
              <p className="text-sm">{msg.text}</p>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {msg.userName} - {new Date(msg.timestamp).toLocaleTimeString()}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
        <Textarea 
          label="Your Message"
          id="chat-message"
          value={newMessage}
          onChange={e => setNewMessage(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }}}
          disabled={disabled}
        />
        <Button className="mt-2" onClick={handleSend} disabled={disabled}>Send</Button>
      </div>
    </Card>
  );
};

export default ChatThread;