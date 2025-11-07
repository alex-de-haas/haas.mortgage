'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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
    <main className="container mx-auto p-4 md:p-8 max-w-7xl">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Florius Profijt 3+3 Mortgage</CardTitle>
          <CardDescription>
            Plan the repayment for loan part 101 – €315,000, 3.54% interest, 30 year term. Record
            what was actually paid each month and see the immediate effect on the remaining balance
            and end date.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="space-y-2">
              <Label htmlFor="principal">Loan (EUR)</Label>
              <Input
                id="principal"
                type="number"
                min={0}
                step={100}
                value={principal}
                onChange={(event) => setPrincipal(Number(event.target.value) || 0)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="rate">Interest p.a. (%)</Label>
              <Input
                id="rate"
                type="number"
                min={0}
                step={0.01}
                value={annualRate}
                onChange={(event) => setAnnualRate(Number(event.target.value) || 0)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="term">Term (years)</Label>
              <Input
                id="term"
                type="number"
                min={1}
                step={1}
                value={termYears}
                onChange={(event) => setTermYears(Number(event.target.value) || 0)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="start">First payment month</Label>
              <Input
                id="start"
                type="month"
                value={startMonth}
                onChange={(event) => setStartMonth(event.target.value || DEFAULT_PARAMS.startMonth)}
              />
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-4 items-end">
            <Button
              variant="outline"
              type="button"
              onClick={handleResetOverrides}
            >
              Reset payments
            </Button>
            <div className="space-y-2 flex-1">
              <Label htmlFor="extraAmount">Extra payment per month (EUR)</Label>
              <Input
                id="extraAmount"
                type="number"
                min={0}
                step={50}
                value={extraPaymentAmount}
                placeholder="E.g. 250, 500, 1000"
                onChange={(event) => setExtraPaymentAmount(event.target.value)}
              />
            </div>
            <Button
              type="button"
              onClick={() => {
                const amount = Number(extraPaymentAmount);
                if (amount > 0) {
                  handleApplyExtra(amount);
                }
              }}
            >
              Apply extra payment
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Key Metrics</CardTitle>
          <CardDescription>
            Compare the original plan with the current payments and interest savings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div className="p-4 rounded-lg border bg-card">
              <div className="text-sm text-muted-foreground mb-1">Total payments</div>
              <div className="text-2xl font-bold">{toCurrency(totals.totalActualPaid)}</div>
            </div>
            <div className="p-4 rounded-lg border bg-card">
              <div className="text-sm text-muted-foreground mb-1">Interest paid</div>
              <div className="text-2xl font-bold">{toCurrency(totals.actualInterest)}</div>
            </div>
            <div className="p-4 rounded-lg border bg-card">
              <div className="text-sm text-muted-foreground mb-1">Interest saved</div>
              <div className="text-2xl font-bold text-green-600">{toCurrency(totals.interestSaved)}</div>
            </div>
            <div className="p-4 rounded-lg border bg-card">
              <div className="text-sm text-muted-foreground mb-1">Paid off in</div>
              <div className="text-2xl font-bold">
                {totals.actualPayoffDate ? monthFormatter.format(totals.actualPayoffDate) : 'TBD'}
              </div>
            </div>
          </div>
          <div className="space-y-2 text-sm text-muted-foreground border-t pt-4">
            <p>
              Base plan: {totals.baseMonths} months (
              {totals.basePayoffDate ? monthFormatter.format(totals.basePayoffDate) : 'TBD'})
            </p>
            <p>
              Current scenario: {totals.actualMonths} months (
              {totals.actualPayoffDate ? monthFormatter.format(totals.actualPayoffDate) : 'TBD'})
            </p>
            <p>
              Total extra payments: <strong className="text-foreground">{toCurrency(totals.extraPaid)}</strong>
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment Schedule</CardTitle>
          <CardDescription>
            Track your monthly payments and see the impact on your mortgage balance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">#</TableHead>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                  <TableHead className="text-right">Interest</TableHead>
                  <TableHead className="text-right">Principal</TableHead>
                  <TableHead>Actual paid</TableHead>
                  <TableHead className="text-right">Extra</TableHead>
                  <TableHead className="text-right">Shortfall</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {actualSchedule.map((row) => {
                  const inputValue = inputValues[row.monthIndex] ?? '';
                  const isCleared = row.balanceAfter <= 0.01;

                  return (
                    <TableRow
                      key={row.monthIndex}
                      className={isCleared ? 'bg-green-50' : undefined}
                    >
                      <TableCell className="font-medium">{row.monthIndex}</TableCell>
                      <TableCell>{monthFormatter.format(row.dueDate)}</TableCell>
                      <TableCell className="text-right">{toCurrency(row.plannedPayment)}</TableCell>
                      <TableCell className="text-right">{toCurrency(row.plannedInterest)}</TableCell>
                      <TableCell className="text-right">{toCurrency(row.plannedPrincipal)}</TableCell>
                      <TableCell>
                        <Input
                          className="max-w-[140px]"
                          type="text"
                          inputMode="decimal"
                          value={inputValue}
                          placeholder={row.plannedPayment.toFixed(2)}
                          onChange={(event) =>
                            handleActualPaymentChange(row.monthIndex, event.target.value)
                          }
                        />
                        <div className="text-xs text-muted-foreground mt-1">
                          {toCurrency(row.actualPayment)}
                        </div>
                      </TableCell>
                      <TableCell className={row.extraPayment > 0 ? 'text-right text-green-600 font-medium' : 'text-right'}>
                        {row.extraPayment > 0 ? toCurrency(row.extraPayment) : '—'}
                      </TableCell>
                      <TableCell className={row.shortfall > 0 ? 'text-right text-red-600 font-medium' : 'text-right'}>
                        {row.shortfall > 0 ? toCurrency(row.shortfall) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-medium">{toCurrency(row.balanceAfter)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
