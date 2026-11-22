import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

describe('EnvGuard workflow', () => {
  it('checks the demo files and never renders values', () => {
    window.location.hash = '/check';
    render(<App />);
    expect(screen.getByTestId('missing')).toHaveTextContent('1'); // ENABLE_SIGNUPS missing; REDIS_URL is optional
    expect(screen.getByTestId('invalid')).toHaveTextContent('2'); // NODE_ENV=prod, SUPPORT_EMAIL
    expect(screen.getByTestId('extra')).toHaveTextContent('1');
    const results = screen.getByRole('table');
    expect(results.textContent).not.toContain('demo-password');
    expect(results.textContent).not.toContain('demo-not-a-real-key');
    expect(screen.getByText(/Also defined on line 3/)).toBeInTheDocument();
    expect(screen.getByText(/Keys may only use letters/)).toBeInTheDocument();
  });

  it('does not store the .env in localStorage', () => {
    window.location.hash = '/check';
    render(<App />);
    fireEvent.change(screen.getByLabelText('.env file'), { target: { value: 'SECRET_VALUE_XYZ=abc' } });
    expect(JSON.stringify({ ...localStorage })).not.toContain('SECRET_VALUE_XYZ');
  });

  it('reports schema errors and a fully valid file', async () => {
    window.location.hash = '/check';
    render(<App />);
    fireEvent.change(screen.getByLabelText('Required keys (schema)'), { target: { value: 'PORT colour' } });
    expect(screen.getByText(/Unknown type “colour”/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Required keys (schema)'), { target: { value: 'PORT port\nDEBUG? boolean' } });
    fireEvent.change(screen.getByLabelText('.env file'), { target: { value: 'PORT=3000' } });
    expect(screen.getByText('Everything the schema requires is present and valid.')).toBeInTheDocument();
  });

  it('shows the empty state', async () => {
    window.location.hash = '/check';
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Clear .env' }));
    expect(screen.getByText('Paste a .env file to check it')).toBeInTheDocument();
  });
});
