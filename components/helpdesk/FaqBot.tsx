
import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { mockKbArticles, mockMemos, mockCodeOfDiscipline } from '../../services/mockData';
import Button from '../ui/Button';

// Icons
const QuestionMarkCircleIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const XIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>;
const PaperAirplaneIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>;

interface Message {
    id: number;
    text: React.ReactNode;
    sender: 'user' | 'bot';
}

const FaqBot: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [messages, setMessages] = useState<Message[]>([
        { id: 1, text: "Hi! I'm your friendly FAQ Bot. Ask me a question about company policies, memos, or procedures.", sender: 'bot' }
    ]);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim()) return;

        const userMessage: Message = {
            id: Date.now(),
            text: inputValue,
            sender: 'user'
        };
        setMessages(prev => [...prev, userMessage]);
        setInputValue('');
        
        // Simulate bot response
        setTimeout(() => {
            const searchTerms = inputValue.toLowerCase().split(' ').filter(word => word.length > 2);
            
            // 1. Search Knowledge Base
            const kbResults = mockKbArticles.filter(article => {
                const content = `${article.title} ${article.content} ${article.tags.join(' ')}`.toLowerCase();
                return searchTerms.every(term => content.includes(term));
            }).map(item => ({
                id: `kb-${item.id}`,
                title: item.title,
                link: `/helpdesk/knowledge-base?article=${item.slug}`,
                type: 'Article'
            }));

            // 2. Search Memos
            const memoResults = mockMemos.filter(memo => {
                const content = `${memo.title} ${memo.body} ${memo.tags.join(' ')}`.toLowerCase();
                return searchTerms.every(term => content.includes(term));
            }).map(item => ({
                id: `memo-${item.id}`,
                title: item.title,
                link: '/feedback/memos',
                type: 'Memo'
            }));

            // 3. Search Code of Discipline
            const codResults = mockCodeOfDiscipline.entries.filter(entry => {
                 const content = `${entry.code} ${entry.category} ${entry.description}`.toLowerCase();
                 return searchTerms.every(term => content.includes(term));
            }).map(item => ({
                id: `cod-${item.id}`,
                title: `${item.category} (${item.code}): ${item.description.substring(0, 50)}...`,
                link: '/feedback/discipline',
                type: 'Policy'
            }));

            const allResults = [...kbResults, ...memoResults, ...codResults];
            
            let botResponse: Message;
            if (allResults.length > 0) {
                botResponse = {
                    id: Date.now() + 1,
                    text: (
                        <>
                            <p>I found {allResults.length} result(s) that might help:</p>
                            <ul className="list-none mt-2 space-y-2">
                                {allResults.slice(0, 5).map(item => (
                                    <li key={item.id} className="text-sm border-b border-gray-200 dark:border-gray-700 pb-1 last:border-0">
                                        <div className="flex items-center mb-1">
                                            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded mr-2 ${
                                                item.type === 'Article' ? 'bg-blue-100 text-blue-800' :
                                                item.type === 'Memo' ? 'bg-green-100 text-green-800' :
                                                'bg-red-100 text-red-800'
                                            }`}>
                                                {item.type}
                                            </span>
                                        </div>
                                        <Link to={item.link} onClick={() => setIsOpen(false)} className="text-indigo-600 dark:text-indigo-400 hover:underline block">
                                            {item.title}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                            {allResults.length > 5 && <p className="text-xs text-gray-500 mt-2 italic">...and {allResults.length - 5} more.</p>}
                        </>
                    ),
                    sender: 'bot'
                };
            } else {
                 botResponse = {
                    id: Date.now() + 1,
                    text: "I couldn't find any specific articles, memos, or policies for that. Try using different keywords, or browse the Knowledge Base directly.",
                    sender: 'bot'
                };
            }
            setMessages(prev => [...prev, botResponse]);

        }, 1000);
    };

    return (
        <>
            <div className={`fixed bottom-4 right-4 md:bottom-8 md:right-8 z-40 transition-all duration-300 ${isOpen ? 'opacity-0 scale-75' : 'opacity-100 scale-100'}`}>
                <button
                    onClick={() => setIsOpen(true)}
                    className="bg-indigo-600 text-white p-4 rounded-full shadow-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    aria-label="Open FAQ Bot"
                >
                    <QuestionMarkCircleIcon />
                </button>
            </div>
            
            <div className={`fixed bottom-4 right-4 md:bottom-8 md:right-8 z-50 w-[calc(100%-2rem)] max-w-sm h-[70vh] max-h-[600px] bg-white dark:bg-slate-800 rounded-lg shadow-2xl flex flex-col transition-all duration-300 origin-bottom-right ${isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}>
                {/* Header */}
                <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-slate-700 bg-indigo-600 rounded-t-lg">
                    <h3 className="font-semibold text-white">FAQ Bot</h3>
                    <button onClick={() => setIsOpen(false)} className="p-1 rounded-full text-white hover:bg-indigo-700"><XIcon /></button>
                </div>
                {/* Messages */}
                <div className="flex-grow p-4 overflow-y-auto space-y-4">
                    {messages.map(msg => (
                        <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] px-3 py-2 rounded-lg ${msg.sender === 'user' ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-800 dark:text-gray-200'}`}>
                                {typeof msg.text === 'string' ? <p className="text-sm">{msg.text}</p> : msg.text}
                            </div>
                        </div>
                    ))}
                     <div ref={messagesEndRef} />
                </div>
                {/* Input */}
                <div className="p-4 border-t border-gray-200 dark:border-slate-700">
                    <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            placeholder="Ask a question..."
                            className="flex-grow px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                        />
                        <Button type="submit" className="!p-2.5">
                            <PaperAirplaneIcon />
                        </Button>
                    </form>
                </div>
            </div>
        </>
    );
};

export default FaqBot;
