'use client';

import { useMemo, useState } from 'react';
import styles from './page.module.css';

type ActualPaymentsMap = Record<number, number>;

type ScheduleRow = {
  monthIndex: number;
  dueDate: Date;
  plannedPayment: number;
  plannedPrincipal: number;
  plannedInterest: number;
  actualPayment: number;
  interestPaid: number;
  principalPaid: number;
  extraPayment: number;
  shortfall: number;
  balanceAfter: number;
};

const DEFAULT_PARAMS = {
  principal: 315_000,
  annualRate: 3.54,
  termYears: 30,
  startMonth: '2025-12'
};

const currencyFormatter = new Intl.NumberFormat('nl-NL', {
  style: 'currency',
  currency: 'EUR'
});

const monthFormatter = new Intl.DateTimeFormat('nl-NL', {
  month: 'long',
  year: 'numeric'
});

function parseMonthInput(value: string): Date {
  const [year, month] = value.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return new Date();
  }
  return new Date(year, month - 1, 1);
}

function addMonths(date: Date, count: number): Date {
  const cloned = new Date(date.getTime());
  cloned.setMonth(cloned.getMonth() + count);
  return cloned;
}

function toCurrency(value: number): string {
  return currencyFormatter.format(Math.round(value * 100) / 100);
}

function calculateSchedule(
  principal: number,
  annualRate: number,
  termMonths: number,
  startMonth: string,
  overrides: ActualPaymentsMap
): ScheduleRow[] {
  if (principal <= 0 || termMonths <= 0) {
    return [];
  }

  const schedule: ScheduleRow[] = [];
  const firstDueDate = parseMonthInput(startMonth);
  const monthlyRate = annualRate / 100 / 12;
  let balance = principal;
  let monthIndex = 1;
  let dueDate = new Date(firstDueDate.getTime());
  const epsilon = 1e-2;

  while ((monthIndex <= termMonths || balance > epsilon) && monthIndex < 1200) {
    const monthsRemaining = Math.max(termMonths - monthIndex + 1, 1);
    const plannedPrincipal = balance / monthsRemaining;
    const plannedInterest = balance * monthlyRate;
    const plannedPayment = plannedPrincipal + plannedInterest;

    const overrideValue = overrides[monthIndex];
    const actualPayment =
      overrideValue !== undefined && Number.isFinite(overrideValue) ? overrideValue : plannedPayment;

    const interestPaid = Math.min(actualPayment, plannedInterest);
    let principalPaid = Math.max(actualPayment - interestPaid, 0);
    if (principalPaid > balance) {
      principalPaid = balance;
    }

    const balanceAfter = Math.max(balance - principalPaid, 0);
    const extraPayment = Math.max(actualPayment - plannedPayment, 0);
    const shortfall = Math.max(plannedPayment - actualPayment, 0);

    schedule.push({
      monthIndex,
      dueDate: new Date(dueDate.getTime()),
      plannedPayment,
      plannedPrincipal: Math.min(plannedPrincipal, balance),
      plannedInterest,
      actualPayment,
      interestPaid,
      principalPaid,
      extraPayment,
      shortfall,
      balanceAfter
    });

    balance = balanceAfter;
    monthIndex += 1;
    dueDate = addMonths(dueDate, 1);

    if (balance <= epsilon) {
      break;
    }
  }

  return schedule;
}

export default function MortgagePlannerPage() {
  const [principal, setPrincipal] = useState<number>(DEFAULT_PARAMS.principal);
  const [annualRate, setAnnualRate] = useState<number>(DEFAULT_PARAMS.annualRate);
  const [termYears, setTermYears] = useState<number>(DEFAULT_PARAMS.termYears);
  const [startMonth, setStartMonth] = useState<string>(DEFAULT_PARAMS.startMonth);
  const [overrides, setOverrides] = useState<ActualPaymentsMap>({});
  const [inputValues, setInputValues] = useState<Record<number, string>>({});
  const [extraPaymentAmount, setExtraPaymentAmount] = useState<string>('');

  const termMonths = Math.max(Math.round(termYears * 12), 1);

  const baseSchedule = useMemo(
    () => calculateSchedule(principal, annualRate, termMonths, startMonth, {}),
    [principal, annualRate, termMonths, startMonth]
  );

  const actualSchedule = useMemo(
    () => calculateSchedule(principal, annualRate, termMonths, startMonth, overrides),
    [principal, annualRate, termMonths, startMonth, overrides]
  );

  const totals = useMemo(() => {
    const baseInterest = baseSchedule.reduce((sum, row) => sum + row.interestPaid, 0);
    const actualInterest = actualSchedule.reduce((sum, row) => sum + row.interestPaid, 0);
    const totalActualPaid = actualSchedule.reduce((sum, row) => sum + row.actualPayment, 0);
    const extraPaid = actualSchedule.reduce((sum, row) => sum + row.extraPayment, 0);

    const baseMonths = baseSchedule.length;
    const actualMonths = actualSchedule.length;

    const basePayoffDate = baseSchedule[baseSchedule.length - 1]?.dueDate;
    const actualPayoffDate = actualSchedule[actualSchedule.length - 1]?.dueDate;

    return {
      baseInterest,
      actualInterest,
      interestSaved: Math.max(baseInterest - actualInterest, 0),
      totalActualPaid,
      extraPaid,
      baseMonths,
      actualMonths,
      basePayoffDate,
      actualPayoffDate
    };
  }, [baseSchedule, actualSchedule]);

  const handleActualPaymentChange = (index: number, value: string) => {
    setInputValues((prev) => ({
      ...prev,
      [index]: value
    }));

    const numeric = Number(value);
    setOverrides((prev) => {
      const next = { ...prev };
      if (!value || Number.isNaN(numeric)) {
        delete next[index];
      } else {
        next[index] = numeric;
      }
      return next;
    });
  };

  const handleResetOverrides = () => {
    setOverrides({});
    setInputValues({});
  };

  const handleApplyExtra = (amount: number) => {
    const newInputValues: Record<number, string> = {};
    setOverrides((prev) => {
      const next: ActualPaymentsMap = { ...prev };
      baseSchedule.forEach((row) => {
        const scheduled = row.plannedPayment;
        const newValue = scheduled + amount;
        next[row.monthIndex] = newValue;
        newInputValues[row.monthIndex] = newValue.toFixed(2);
      });
      return next;
    });
    setInputValues(newInputValues);
  };

  return (
    <main className={styles.container}>
      <section className={styles.panel}>
        <header className={styles.panelHeader}>
          <h1 className={styles.panelTitle}>Florius Profijt 3+3 hypotheek</h1>
          <p className={styles.panelSubtitle}>
            Plan de aflossing voor leningdeel 101 – €315.000, 3,54% rente, 30 jaar looptijd. Leg
            per maand vast wat er daadwerkelijk is betaald en zie direct het effect op de restschuld
            en einddatum.
          </p>
        </header>

        <div className={styles.formGrid}>
          <div className={styles.field}>
            <label htmlFor="principal">Lening (EUR)</label>
            <input
              id="principal"
              type="number"
              min={0}
              step={100}
              value={principal}
              onChange={(event) => setPrincipal(Number(event.target.value) || 0)}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="rate">Rente p.j. (%)</label>
            <input
              id="rate"
              type="number"
              min={0}
              step={0.01}
              value={annualRate}
              onChange={(event) => setAnnualRate(Number(event.target.value) || 0)}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="term">Looptijd (jaar)</label>
            <input
              id="term"
              type="number"
              min={1}
              step={1}
              value={termYears}
              onChange={(event) => setTermYears(Number(event.target.value) || 0)}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="start">Eerste betaalmaand</label>
            <input
              id="start"
              type="month"
              value={startMonth}
              onChange={(event) => setStartMonth(event.target.value || DEFAULT_PARAMS.startMonth)}
            />
          </div>
        </div>

        <div className={styles.actions}>
          <button
            className={`${styles.button} ${styles.buttonSecondary}`}
            type="button"
            onClick={handleResetOverrides}
          >
            Reset betalingen
          </button>
          <div className={styles.field}>
            <label htmlFor="extraAmount">Extra aflossing per maand (EUR)</label>
            <input
              id="extraAmount"
              type="number"
              min={0}
              step={50}
              value={extraPaymentAmount}
              placeholder="Bijv. 250, 500, 1000"
              onChange={(event) => setExtraPaymentAmount(event.target.value)}
            />
          </div>
          <button
            className={`${styles.button} ${styles.buttonPrimary}`}
            type="button"
            onClick={() => {
              const amount = Number(extraPaymentAmount);
              if (amount > 0) {
                handleApplyExtra(amount);
              }
            }}
          >
            Pas extra aflossing toe
          </button>
        </div>
      </section>

      <section className={styles.panel}>
        <header className={styles.panelHeader}>
          <h2 className={styles.panelTitle}>Belangrijkste kengetallen</h2>
          <p className={styles.panelSubtitle}>
            Vergelijk de oorspronkelijke planning met de huidige betalingen en besparing op rente.
          </p>
        </header>
        <div className={styles.metrics}>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>Totale betalingen</span>
            <span className={styles.metricValue}>{toCurrency(totals.totalActualPaid)}</span>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>Betaalde rente</span>
            <span className={styles.metricValue}>{toCurrency(totals.actualInterest)}</span>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>Rente bespaard</span>
            <span className={styles.metricValue}>{toCurrency(totals.interestSaved)}</span>
          </div>
          <div className={styles.metricCard}>
            <span className={styles.metricLabel}>Afgerond in</span>
            <span className={styles.metricValue}>
              {totals.actualPayoffDate ? monthFormatter.format(totals.actualPayoffDate) : 'n.t.b.'}
            </span>
          </div>
        </div>
        <div className={styles.legend}>
          <span>
            Basisplanning: {totals.baseMonths} maanden (
            {totals.basePayoffDate ? monthFormatter.format(totals.basePayoffDate) : 'n.t.b.'})
          </span>
          <span>
            Huidig scenario: {totals.actualMonths} maanden (
            {totals.actualPayoffDate ? monthFormatter.format(totals.actualPayoffDate) : 'n.t.b.'})
          </span>
          <span>
            Extra aflossingen totaal: <strong>{toCurrency(totals.extraPaid)}</strong>
          </span>
        </div>
      </section>

      <section className={styles.tableWrapper}>
        <table className={styles.scheduleTable}>
          <thead>
            <tr>
              <th>#</th>
              <th>Maand</th>
              <th>Te betalen</th>
              <th>Rente</th>
              <th>Aflossing</th>
              <th>Werkelijk betaald</th>
              <th>Extra</th>
              <th>Tekort</th>
              <th>Restschuld</th>
            </tr>
          </thead>
          <tbody>
            {actualSchedule.map((row) => {
              const inputValue = inputValues[row.monthIndex] ?? '';
              const isCleared = row.balanceAfter <= 0.01;

              return (
                <tr
                  key={row.monthIndex}
                  className={isCleared ? styles.balanceCleared : undefined}
                >
                  <td>{row.monthIndex}</td>
                  <td>{monthFormatter.format(row.dueDate)}</td>
                  <td>{toCurrency(row.plannedPayment)}</td>
                  <td>{toCurrency(row.plannedInterest)}</td>
                  <td>{toCurrency(row.plannedPrincipal)}</td>
                  <td>
                    <input
                      className={styles.actualInput}
                      type="text"
                      inputMode="decimal"
                      value={inputValue}
                      placeholder={row.plannedPayment.toFixed(2)}
                      onChange={(event) =>
                        handleActualPaymentChange(row.monthIndex, event.target.value)
                      }
                    />
                    <div>
                      <small>{toCurrency(row.actualPayment)}</small>
                    </div>
                  </td>
                  <td className={row.extraPayment > 0 ? styles.positive : undefined}>
                    {row.extraPayment > 0 ? toCurrency(row.extraPayment) : '—'}
                  </td>
                  <td className={row.shortfall > 0 ? styles.shortfall : undefined}>
                    {row.shortfall > 0 ? toCurrency(row.shortfall) : '—'}
                  </td>
                  <td>{toCurrency(row.balanceAfter)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </main>
  );
}
