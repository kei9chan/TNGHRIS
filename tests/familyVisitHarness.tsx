import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import FamilyVisitPanel from '../components/employees/FamilyVisitPanel';
createRoot(document.getElementById('root')!).render(<BrowserRouter><FamilyVisitPanel/></BrowserRouter>);
