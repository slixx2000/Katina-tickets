import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { KeyRound, ShieldCheck, ShieldOff, Smartphone, RefreshCw } from 'lucide-react';
import {
  activateMfa,
  disableMfa,
  enrollMfa,
  fetchMfaStatus,
  type AppSessionUser,
  type MfaStatusResponse,
} from '../auth/session';

type MfaSettingsPanelProps = {
  currentUser: AppSessionUser;
  onSessionRefresh: () => Promise<void>;
};

const INITIAL_STATUS: MfaStatusResponse = {
  success: true,
  enrolled: false,
  pending: false,
  required: false,
  factorId: null,
  label: null,
  secret: null,
  otpauthUrl: null,
  recoveryCodeCount: 0,
};

export default function MfaSettingsPanel({ currentUser, onSessionRefresh }: MfaSettingsPanelProps) {
  const [status, setStatus] = useState<MfaStatusResponse>(INITIAL_STATUS);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await fetchMfaStatus());
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to load MFA status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  const handleEnroll = async () => {
    setWorking(true);
    setError(null);
    setMessage(null);
    setBackupCodes([]);
    try {
      const response = await enrollMfa('Primary Authenticator');
      setStatus((prev) => ({
        ...prev,
        pending: true,
        factorId: response.factorId,
        secret: response.secret,
        otpauthUrl: response.otpauthUrl,
      }));
      setMessage('Scan the QR code and enter the 6-digit code from your authenticator app.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to enroll MFA.');
    } finally {
      setWorking(false);
    }
  };

  const handleActivate = async () => {
    if (!status.factorId) {
      setError('Missing pending MFA factor. Start enrollment again.');
      return;
    }

    setWorking(true);
    setError(null);
    setMessage(null);
    try {
      const response = await activateMfa(status.factorId, verificationCode);
      setBackupCodes(response.backupCodes);
      setVerificationCode('');
      setMessage(response.message);
      await onSessionRefresh();
      await loadStatus();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to activate MFA.');
    } finally {
      setWorking(false);
    }
  };

  const handleDisable = async () => {
    setWorking(true);
    setError(null);
    setMessage(null);
    try {
      await disableMfa(disableCode);
      setDisableCode('');
      setBackupCodes([]);
      setMessage('MFA disabled.');
      await onSessionRefresh();
      await loadStatus();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Unable to disable MFA.');
    } finally {
      setWorking(false);
    }
  };

  const showQr = Boolean(status.pending && status.otpauthUrl);

  return (
    <section className="bg-[#4E1413] border border-[#6A6A57]/30 p-8 rounded-none shadow-md text-[#F4F4F2] mb-12">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 mb-6">
        <div>
          <p className="font-label-caps text-[10px] tracking-[0.35em] text-[#F4F4F2]/65 mb-2 font-bold">SECURITY SETTINGS</p>
          <h3 className="font-display text-3xl uppercase tracking-tight font-bold flex items-center gap-3">
            <ShieldCheck className="w-7 h-7 text-[#A3A46A]" />
            Multi-Factor Authentication
          </h3>
          <p className="text-sm text-[#F4F4F2]/70 mt-3 max-w-2xl leading-relaxed">
            Protect privileged access with a TOTP authenticator app and one-time recovery codes. Recommended for {currentUser.role} accounts.
          </p>
        </div>

        <button
          type="button"
          onClick={() => { void loadStatus(); }}
          disabled={loading || working}
          className="px-4 py-3 border border-[#F4F4F2]/25 hover:border-[#F4F4F2]/55 text-xs font-label-caps tracking-[0.24em] flex items-center gap-2 justify-center disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh Status
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-8">
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="border border-[#F4F4F2]/15 p-4 bg-black/10">
              <p className="font-label-caps text-[10px] tracking-[0.28em] text-[#F4F4F2]/55 mb-2">Role</p>
              <p className="text-lg font-bold">{currentUser.role}</p>
            </div>
            <div className="border border-[#F4F4F2]/15 p-4 bg-black/10">
              <p className="font-label-caps text-[10px] tracking-[0.28em] text-[#F4F4F2]/55 mb-2">Requirement</p>
              <p className="text-lg font-bold">{status.required ? 'Required' : 'Optional'}</p>
            </div>
            <div className="border border-[#F4F4F2]/15 p-4 bg-black/10">
              <p className="font-label-caps text-[10px] tracking-[0.28em] text-[#F4F4F2]/55 mb-2">Status</p>
              <p className="text-lg font-bold">{status.enrolled ? 'Active' : status.pending ? 'Pending' : 'Inactive'}</p>
            </div>
          </div>

          {error && <p className="text-sm text-[#ffb6b6] border border-[#ffb6b6]/30 p-3 bg-[#2b0f10]">{error}</p>}
          {message && <p className="text-sm text-[#dfe3b0] border border-[#A3A46A]/30 p-3 bg-[#313019]">{message}</p>}

          {!status.enrolled && !status.pending && (
            <div className="border border-[#F4F4F2]/15 p-5 bg-black/10 space-y-4">
              <div className="flex items-center gap-3">
                <Smartphone className="w-5 h-5 text-[#A3A46A]" />
                <p className="font-headline-sm text-xl font-bold">Enable Authenticator App MFA</p>
              </div>
              <p className="text-sm text-[#F4F4F2]/70 leading-relaxed">
                Start enrollment to receive a QR code that you can scan with Google Authenticator, 1Password, Microsoft Authenticator, or any RFC 6238 TOTP app.
              </p>
              <button
                type="button"
                onClick={() => { void handleEnroll(); }}
                disabled={working}
                className="px-6 py-3 bg-[#F4F4F2] text-[#4E1413] font-label-caps text-[10px] tracking-[0.28em] font-bold border border-[#F4F4F2] disabled:opacity-60"
              >
                {working ? 'Preparing…' : 'Start MFA Enrollment'}
              </button>
            </div>
          )}

          {status.pending && (
            <div className="border border-[#A3A46A]/30 p-5 bg-[#302c18] space-y-4">
              <div className="flex items-center gap-3">
                <KeyRound className="w-5 h-5 text-[#A3A46A]" />
                <p className="font-headline-sm text-xl font-bold">Verify Your Authenticator</p>
              </div>
              <p className="text-sm text-[#F4F4F2]/74 leading-relaxed">
                After scanning the QR code, enter the 6-digit code from your authenticator app to activate MFA and generate recovery codes.
              </p>
              <input
                value={verificationCode}
                onChange={(event) => setVerificationCode(event.target.value)}
                placeholder="123456"
                className="w-full max-w-sm p-3 bg-transparent border border-[#F4F4F2]/25 text-[#F4F4F2]"
              />
              <button
                type="button"
                onClick={() => { void handleActivate(); }}
                disabled={working || !verificationCode.trim()}
                className="px-6 py-3 bg-[#A3A46A] text-[#171711] font-label-caps text-[10px] tracking-[0.28em] font-bold border border-[#A3A46A] disabled:opacity-60"
              >
                {working ? 'Verifying…' : 'Activate MFA'}
              </button>
            </div>
          )}

          {status.enrolled && (
            <div className="border border-[#F4F4F2]/15 p-5 bg-black/10 space-y-4">
              <div className="flex items-center gap-3">
                <ShieldOff className="w-5 h-5 text-[#F4F4F2]" />
                <p className="font-headline-sm text-xl font-bold">Disable MFA</p>
              </div>
              <p className="text-sm text-[#F4F4F2]/70 leading-relaxed">
                Disabling MFA requires a current authenticator code or one unused backup recovery code.
              </p>
              <input
                value={disableCode}
                onChange={(event) => setDisableCode(event.target.value)}
                placeholder="123456 or XXXX-XXXX"
                className="w-full max-w-sm p-3 bg-transparent border border-[#F4F4F2]/25 text-[#F4F4F2]"
              />
              <button
                type="button"
                onClick={() => { void handleDisable(); }}
                disabled={working || !disableCode.trim()}
                className="px-6 py-3 border border-[#ffb6b6]/45 text-[#ffcccc] font-label-caps text-[10px] tracking-[0.28em] font-bold disabled:opacity-60"
              >
                {working ? 'Processing…' : 'Disable MFA'}
              </button>
            </div>
          )}
        </div>

        <div className="space-y-5">
          {showQr && status.otpauthUrl && (
            <div className="border border-[#F4F4F2]/15 p-5 bg-[#F4F4F2] text-[#4E1413] flex flex-col items-center gap-4">
              <QRCodeSVG value={status.otpauthUrl} size={200} includeMargin />
              <p className="text-xs tracking-[0.2em] font-label-caps text-center font-bold">Scan With Your Authenticator App</p>
              {status.secret && (
                <div className="w-full bg-[#efece7] border border-[#4E1413]/15 p-3">
                  <p className="text-[10px] tracking-[0.22em] font-label-caps mb-2">Manual Secret</p>
                  <p className="font-mono text-sm break-all">{status.secret}</p>
                </div>
              )}
            </div>
          )}

          {(backupCodes.length > 0 || (status.recoveryCodeCount ?? 0) > 0) && (
            <div className="border border-[#F4F4F2]/15 p-5 bg-black/10 space-y-4">
              <p className="font-headline-sm text-xl font-bold">Recovery Codes</p>
              {backupCodes.length > 0 ? (
                <>
                  <p className="text-sm text-[#F4F4F2]/74 leading-relaxed">
                    Save these one-time recovery codes now. They are shown only once and each code can be used a single time.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {backupCodes.map((code) => (
                      <div key={code} className="border border-[#A3A46A]/30 px-3 py-2 font-mono text-sm bg-[#252313]">
                        {code}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-[#F4F4F2]/70 leading-relaxed">
                  Recovery codes are active on this account. Generate a new set by disabling and re-enrolling MFA if rotation is needed.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
