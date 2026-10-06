import { useState, useCallback, useRef } from 'react';
import { supabase, formatCurrency, formatDate, type Account, type CreditCard as CreditCardType, type Benefit, type Loan, type Profile } from '@/lib/supabase';
import { Upload, FileUp, CheckCircle2, AlertTriangle, X, ChevronLeft, ChevronRight, Building2, CreditCard, Wallet, Landmark, Loader2, FileText } from 'lucide-react';
import { parseStatementFile, type ParsedTransaction, type ParseResult, type ImportTarget } from '@/lib/importParser';
import { useProfile } from '@/lib/profile';
import { EmptyState } from '@/components/Shared';
import { recalcInvoiceAmount } from '@/lib/transactionHelpers';

export function Import() {
  const { profile } = useProfile();
  const [step, setStep] = useState<'upload' | 'configure' | 'preview' | 'done'>('upload');
  const [fileName, setFileName] = useState('');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
  const [target, setTarget] = useState<ImportTarget>('account');
  const [targetId, setTargetId] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<CreditCardType[]>([]);
  const [benefits, setBenefits] = useState<Benefit[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadTargets = useCallback(async () => {
    const [accs, cds, bens, lns] = await Promise.all([
      supabase.from('accounts').select('*').eq('profile', profile).order('name'),
      supabase.from('credit_cards').select('*').eq('profile', profile).order('name'),
      supabase.from('benefits').select('*').eq('profile', profile).order('name'),
      supabase.from('loans').select('*').eq('profile', profile).order('name'),
    ]);
    setAccounts(accs.data || []);
    setCards(cds.data || []);
    setBenefits(bens.data || []);
    setLoans(lns.data || []);
  }, [profile]);

  async function handleFile(file: File) {
    setError('');
    setFileName(file.name);
    try {
      const text = await file.text();
      const result = await parseStatementFile(file.name, text);
      if (result.transactions.length === 0) {
        setError('Nenhum lançamento encontrado no arquivo. Verifique o formato.');
        return;
      }
      setParseResult(result);
      setTransactions(result.transactions);
      await loadTargets();
      setStep('configure');
    } catch {
      setError('Erro ao processar o arquivo. Verifique se o formato é OFX ou CSV válido.');
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function targetOptions() {
    if (target === 'account') return accounts.map(a => ({ id: a.id, label: `${a.name} — ${a.institution}`, icon: Building2, color: a.color }));
    if (target === 'card') return cards.map(c => ({ id: c.id, label: `${c.name} — ${c.institution}`, icon: CreditCard, color: c.color }));
    if (target === 'benefit') return benefits.map(b => ({ id: b.id, label: `${b.name} — ${b.provider}`, icon: Wallet, color: b.color }));
    if (target === 'loan') return loans.map(l => ({ id: l.id, label: `${l.name} — ${l.institution}`, icon: Landmark, color: l.color }));
    return [];
  }

  async function checkDuplicates() {
    if (!targetId || transactions.length === 0) return;
    const hashes = transactions.map(t => t.importHash);
    const { data } = await supabase
      .from('transactions')
      .select('import_hash')
      .in('import_hash', hashes)
      .eq('profile', profile);
    const existing = new Set((data || []).map(r => r.import_hash));
    setTransactions(prev => prev.map(t => ({ ...t, duplicate: existing.has(t.importHash) })));
  }

  async function proceedToPreview() {
    if (!targetId) return;
    await checkDuplicates();
    setStep('preview');
  }

  async function doImport() {
    setImporting(true);
    setError('');
    const selected = transactions.filter(t => t.selected && !t.duplicate);
    const skipped = transactions.filter(t => t.duplicate).length;
    setSkippedCount(skipped);

    if (selected.length === 0) {
      setImporting(false);
      setImportedCount(0);
      setStep('done');
      return;
    }

    try {
      // Build records based on target type
      const records = selected.map(t => {
        const base: Record<string, unknown> = {
          description: t.description,
          amount: t.amount,
          type: t.type,
          date: t.date,
          confirmed: true,
          source: 'manual',
          notes: null,
          installments_total: 1,
          installment_number: 1,
          import_hash: t.importHash,
          profile: profile as Profile,
        };

        if (target === 'account') base.account_id = targetId;
        else if (target === 'card') base.card_id = targetId;
        else if (target === 'benefit') {
          base._benefit_id = targetId;
        }
        else if (target === 'loan') base.account_id = null;

        return base;
      });

      // Separate benefit transactions from regular transactions
      const regularRecords = records.filter(r => !r._benefit_id);
      const benefitRecords = records.filter(r => r._benefit_id);

      let insertedTxns = 0;

      if (target === 'card' && targetId) {
        // For card imports: find or create the matching invoice for each transaction
        const card = cards.find(c => c.id === targetId);
        if (card) {
          for (const rec of regularRecords) {
            const txnDate = rec.date as string;
            const d = new Date(txnDate);
            const refMonth = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
            const dueDate = new Date(d.getFullYear(), d.getMonth(), card.due_day).toISOString().slice(0, 10);
            const closingDate = new Date(d.getFullYear(), d.getMonth(), card.closing_day).toISOString().slice(0, 10);

            // Find existing invoice for this month
            const { data: existingInv } = await supabase
              .from('card_invoices')
              .select('id')
              .eq('card_id', targetId)
              .eq('reference_month', refMonth)
              .maybeSingle();

            let invoiceId = existingInv?.id;
            if (!invoiceId) {
              const { data: newInv } = await supabase.from('card_invoices').insert({
                card_id: targetId,
                reference_month: refMonth,
                due_date: dueDate,
                closing_date: closingDate,
                amount: 0,
                status: 'future',
                profile: profile as Profile,
              }).select('id').single();
              invoiceId = newInv?.id;
            }

            if (invoiceId) {
              rec.invoice_id = invoiceId;
            }
          }
        }

        const insertData = regularRecords.map(({ _benefit_id, ...rest }) => rest);
        const { error: insErr } = await supabase.from('transactions').insert(insertData);
        if (insErr) throw insErr;
        insertedTxns += regularRecords.length;

        // Recalculate all affected invoices
        const affectedInvoiceIds = new Set<string>();
        regularRecords.forEach(r => { if (r.invoice_id) affectedInvoiceIds.add(r.invoice_id as string); });
        for (const invId of affectedInvoiceIds) {
          await recalcInvoiceAmount(invId);
        }
      } else if (regularRecords.length > 0) {
        const insertData = regularRecords.map(({ _benefit_id, ...rest }) => rest);
        const { error: insErr } = await supabase.from('transactions').insert(insertData);
        if (insErr) throw insErr;
        insertedTxns += regularRecords.length;
      }

      // Handle benefit transactions
      for (const rec of benefitRecords) {
        const benefitId = rec._benefit_id as string;
        const amount = Math.abs(Number(rec.amount));
        const isCredit = Number(rec.amount) >= 0;
        await supabase.from('benefit_transactions').insert({
          benefit_id: benefitId,
          description: rec.description as string,
          amount: isCredit ? amount : -amount,
          type: isCredit ? 'credit' : 'debit',
          date: rec.date as string,
          profile: profile as Profile,
        });
        // Update benefit balance
        const benefit = benefits.find(b => b.id === benefitId);
        if (benefit) {
          const newBalance = Number(benefit.balance) + (isCredit ? amount : -amount);
          await supabase.from('benefits').update({ balance: newBalance }).eq('id', benefitId);
        }
        insertedTxns++;
      }

      // Update account balance if importing to an account
      if (target === 'account' && targetId) {
        const acc = accounts.find(a => a.id === targetId);
        if (acc) {
          const delta = selected.reduce((sum, t) => sum + t.amount, 0);
          await supabase.from('accounts').update({ balance: Number(acc.balance) + delta }).eq('id', targetId);
        }
      }

      setImportedCount(insertedTxns);
      setImporting(false);
      setStep('done');
    } catch {
      setError('Erro ao importar lançamentos. Tente novamente.');
      setImporting(false);
    }
  }

  function reset() {
    setStep('upload');
    setFileName('');
    setParseResult(null);
    setTransactions([]);
    setTargetId('');
    setImportedCount(0);
    setSkippedCount(0);
    setError('');
  }

  const targetOpts = targetOptions();
  const selectedCount = transactions.filter(t => t.selected && !t.duplicate).length;
  const duplicateCount = transactions.filter(t => t.duplicate).length;

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Importar Extrato</h1>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2 text-xs">
        {(['upload', 'configure', 'preview', 'done'].map((s, i) => {
          const labels = ['Arquivo', 'Destino', 'Revisão', 'Conclusão'];
          const isActive = step === s;
          const isPast = ['upload', 'configure', 'preview', 'done'].indexOf(step) > i;
          return (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <ChevronRight size={14} className="text-[#3f3f46]" />}
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${
                isActive ? 'bg-[#10b981]/15 text-[#10b981]' : isPast ? 'text-[#71717a]' : 'text-[#52525b]'
              }`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  isActive ? 'bg-[#10b981] text-white' : isPast ? 'bg-[#27272a] text-[#a1a1aa]' : 'bg-[#18181b] text-[#52525b]'
                }`}>{i + 1}</span>
                {labels[i]}
              </div>
            </div>
          );
        }))}
      </div>

      {error && (
        <div className="card p-3 flex items-center gap-2 border border-[#ef4444]/30 bg-[#ef4444]/5">
          <AlertTriangle size={16} className="text-[#ef4444] flex-shrink-0" />
          <p className="text-sm text-[#ef4444]">{error}</p>
        </div>
      )}

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          className="card p-8 border-2 border-dashed border-[#27272a] hover:border-[#10b981]/30 transition-colors text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-[#10b981]/10 flex items-center justify-center mx-auto mb-4">
            <Upload size={28} className="text-[#10b981]" />
          </div>
          <p className="text-base font-medium text-white mb-1">Arraste seu arquivo aqui</p>
          <p className="text-sm text-[#71717a] mb-4">ou clique para selecionar</p>
          <p className="text-xs text-[#52525b] mb-4">Formatos suportados: .OFX, .QFX, .CSV</p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn-primary inline-flex items-center gap-2"
          >
            <FileUp size={16} /> Selecionar Arquivo
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".ofx,.qfx,.csv,.txt"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>
      )}

      {/* Step 2: Configure */}
      {step === 'configure' && parseResult && (
        <div className="space-y-4">
          <div className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#10b981]/10 flex items-center justify-center flex-shrink-0">
              <FileText size={18} className="text-[#10b981]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{fileName}</p>
              <p className="text-xs text-[#71717a]">
                {parseResult.format.toUpperCase()} • {transactions.length} lançamentos encontrados
                {parseResult.institutionHint && ` • Instituição: ${parseResult.institutionHint}`}
              </p>
            </div>
          </div>

          {/* Target type selection */}
          <div>
            <label className="label mb-2 block">Tipo de destino</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { key: 'account' as const, label: 'Conta Corrente', icon: Building2 },
                { key: 'card' as const, label: 'Cartão de Crédito', icon: CreditCard },
                { key: 'benefit' as const, label: 'Vale (VA/VR)', icon: Wallet },
                { key: 'loan' as const, label: 'Empréstimo', icon: Landmark },
              ]).map(opt => {
                const count = opt.key === 'account' ? accounts.length
                  : opt.key === 'card' ? cards.length
                  : opt.key === 'benefit' ? benefits.length
                  : loans.length;
                return (
                  <button
                    key={opt.key}
                    onClick={() => { setTarget(opt.key); setTargetId(''); }}
                    disabled={count === 0}
                    className={`flex items-center gap-2 p-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-40 ${
                      target === opt.key
                        ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/30'
                        : 'bg-[#27272a] text-[#a1a1aa] border border-[#27272a]'
                    }`}
                  >
                    <opt.icon size={16} />
                    {opt.label}
                    {count === 0 && <span className="text-[10px] text-[#71717a]">(vazio)</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Target entity selection */}
          {targetOpts.length > 0 && (
            <div>
              <label className="label mb-2 block">Selecionar {target === 'account' ? 'conta' : target === 'card' ? 'cartão' : target === 'benefit' ? 'benefício' : 'empréstimo'}</label>
              <div className="space-y-2">
                {targetOpts.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setTargetId(opt.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${
                      targetId === opt.id
                        ? 'bg-[#10b981]/15 border border-[#10b981]/30'
                        : 'bg-[#27272a] border border-[#27272a] hover:border-[#3f3f46]'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${opt.color}20` }}>
                      <opt.icon size={16} style={{ color: opt.color }} />
                    </div>
                    <span className="text-sm text-white flex-1 text-left">{opt.label}</span>
                    {targetId === opt.id && <CheckCircle2 size={16} className="text-[#10b981]" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={reset} className="btn-ghost flex items-center gap-2 border border-[#27272a]">
              <X size={16} /> Cancelar
            </button>
            <button
              onClick={proceedToPreview}
              disabled={!targetId}
              className="flex-1 btn-primary disabled:opacity-40 flex items-center justify-center gap-2"
            >
              Revisar Lançamentos <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Preview */}
      {step === 'preview' && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="grid grid-cols-3 gap-2">
            <div className="card p-3 text-center">
              <p className="text-xs text-[#71717a]">Novos</p>
              <p className="text-lg font-bold text-[#10b981]">{selectedCount}</p>
            </div>
            <div className="card p-3 text-center">
              <p className="text-xs text-[#71717a]">Duplicados</p>
              <p className="text-lg font-bold text-[#f59e0b]">{duplicateCount}</p>
            </div>
            <div className="card p-3 text-center">
              <p className="text-xs text-[#71717a]">Total</p>
              <p className="text-lg font-bold text-white">{transactions.length}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-[#71717a]">
            <input
              type="checkbox"
              checked={transactions.every(t => t.selected)}
              onChange={e => setTransactions(prev => prev.map(t => ({ ...t, selected: e.target.checked })))}
              className="w-4 h-4 rounded accent-[#10b981]"
            />
            <span>Selecionar / desmarcar todos</span>
          </div>

          {/* Transaction list */}
          <div className="card divide-y divide-[#27272a] max-h-[50vh] overflow-y-auto">
            {transactions.map((t, i) => (
              <div key={i} className={`flex items-center gap-3 p-3 ${t.duplicate ? 'opacity-50' : ''}`}>
                <input
                  type="checkbox"
                  checked={t.selected}
                  onChange={e => setTransactions(prev => prev.map((p, idx) => idx === i ? { ...p, selected: e.target.checked } : p))}
                  disabled={t.duplicate}
                  className="w-4 h-4 rounded accent-[#10b981] flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{t.description}</p>
                  <p className="text-xs text-[#71717a]">{formatDate(t.date)}</p>
                </div>
                <p className={`text-sm font-semibold flex-shrink-0 ${t.amount >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                  {t.amount >= 0 ? '+' : ''}{formatCurrency(t.amount)}
                </p>
                {t.duplicate && (
                  <span className="text-xs text-[#f59e0b] flex items-center gap-1 flex-shrink-0">
                    <AlertTriangle size={12} /> Duplicado
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button onClick={() => setStep('configure')} className="btn-ghost flex items-center gap-2 border border-[#27272a]">
              <ChevronLeft size={16} /> Voltar
            </button>
            <button
              onClick={doImport}
              disabled={importing || selectedCount === 0}
              className="flex-1 btn-primary disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {importing ? <><Loader2 size={16} className="animate-spin" /> Importando...</> : <><CheckCircle2 size={16} /> Importar {selectedCount} lançamentos</>}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Done */}
      {step === 'done' && (
        <div className="space-y-4">
          <div className="card p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#10b981]/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={32} className="text-[#10b981]" />
            </div>
            <p className="text-lg font-semibold text-white mb-1">Importação concluída</p>
            <p className="text-sm text-[#71717a] mb-4">
              {importedCount} lançamento{importedCount !== 1 ? 's' : ''} importado{importedCount !== 1 ? 's' : ''} com sucesso.
              {skippedCount > 0 && ` ${skippedCount} duplicado${skippedCount !== 1 ? 's' : ''} ignorado${skippedCount !== 1 ? 's' : ''}.`}
            </p>
            <div className="flex gap-2 justify-center">
              <button onClick={reset} className="btn-primary flex items-center gap-2">
                <Upload size={16} /> Nova Importação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Initial empty state for targets */}
      {step === 'configure' && accounts.length === 0 && cards.length === 0 && benefits.length === 0 && loans.length === 0 && (
        <EmptyState
          icon={<Building2 size={28} />}
          title="Nenhuma conta ou cartão cadastrado"
          description="Cadastre contas, cartões ou benefícios antes de importar extratos."
        />
      )}
    </div>
  );
}
