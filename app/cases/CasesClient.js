'use client';

import { useEffect, useState } from 'react';
import { createBrowserSupabaseClient } from '@supabase/auth-helpers-nextjs';
import shared from '../../styles/shared.module.css';
import shell from '../../styles/pageShell.module.css';
import TopNav from '../components/TopNav';

export default function CasesClient() {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('Draft');
  const [description, setDescription] = useState('');
  const supabase = createBrowserSupabaseClient();

  async function loadCases() {
    setLoading(true);
    const { data, error } = await supabase
      .from('cases')
      .select('id,title,status,description')
      .order('created_at', { ascending: false });
    if (error) {
      setMessage(`Unable to load cases: ${error.message}`);
      setLoading(false);
      return;
    }
    setCases(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadCases();
  }, []);

  async function handleCreateCase(e) {
    e.preventDefault();
    if (!title.trim()) {
      setMessage('Please provide a case title.');
      return;
    }

    const { error } = await supabase.from('cases').insert([{ title, status, description }]);
    if (error) {
      setMessage(`Unable to create case: ${error.message}`);
      return;
    }

    setTitle('');
    setDescription('');
    setStatus('Draft');
    setMessage('Case created successfully.');
    loadCases();
  }

  return (
    <main className={shell.shell}>
      <div className={shell.content}>
        <div className={shared.pageShell}>
          <TopNav />
          <h1 className={shared.pageTitle}>Cases</h1>
          <p className={shared.pageSubtitle}>Review and manage your legal case workflows securely.</p>
          <div className={shared.sectionCard}>
            <form onSubmit={handleCreateCase} className={shared.formGrid}>
              <label className={shared.fieldLabel}>
                Case title
                <input className={shared.input} value={title} onChange={(e) => setTitle(e.target.value)} required />
              </label>
              <label className={shared.fieldLabel}>
                Status
                <select className={shared.select} value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option>Draft</option>
                  <option>Pending</option>
                  <option>Signed</option>
                  <option>Filed</option>
                </select>
              </label>
              <label className={shared.fieldLabel}>
                Description
                <textarea className={shared.textarea} value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
              </label>
              <button type="submit" className={shared.button}>Create case</button>
            </form>
            {message && <p className={`${shared.message} ${shared.messageSuccess}`}>{message}</p>}
          </div>
          <div className={shared.cardGrid} style={{ marginTop: '2rem' }}>
            {cases.map((item) => (
              <div key={item.id} className={shared.cardBlock}>
                <h3 className={shared.cardTitle}>{item.title}</h3>
                <p className={shared.cardText}>Status: {item.status}</p>
                {item.description && <p className={shared.cardText}>{item.description}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
