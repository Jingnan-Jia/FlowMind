import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import { useCloud } from '../lib/cloud';

/**
 * 登录 / 注册弹窗
 * 邮箱 + 验证码：新邮箱自动注册，老邮箱直接登录，无需区分入口
 */
export default function AuthModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const status = useCloud((state) => state.status);
  const errorMessage = useCloud((state) => state.errorMessage);
  const otpSentTo = useCloud((state) => state.otpSentTo);
  const otpCountdown = useCloud((state) => state.otpCountdown);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setEmail('');
      setCode('');
    }
  }, [open]);

  if (!open) return null;

  const sending = status === 'sending-code';
  const verifying = status === 'verifying';
  const canSend = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && otpCountdown === 0 && !sending;

  const handleSend = async (): Promise<void> => {
    await useCloud.getState().sendOtp(email.trim());
    if (useCloud.getState().otpSentTo) codeRef.current?.focus();
  };

  const handleVerify = async (): Promise<void> => {
    const ok = await useCloud.getState().verifyOtp(email.trim(), code.trim());
    if (ok) onClose();
  };

  return (
    <Modal title={otpSentTo ? '输入验证码' : '登录 / 注册'} onClose={onClose} width={360}>
      <p className="auth-subtitle">
        {otpSentTo
          ? `验证码已发送至 ${otpSentTo}，请查收邮件`
          : '新邮箱将自动注册，登录后导图多设备同步'}
      </p>

      <div className="auth-field">
        <input
          type="email"
          placeholder="邮箱地址"
          value={email}
          autoComplete="email"
          disabled={Boolean(otpSentTo)}
          onChange={(event) => setEmail(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && canSend) void handleSend();
          }}
        />
      </div>

      {otpSentTo && (
        <div className="auth-field auth-code-row">
          <input
            ref={codeRef}
            type="text"
            inputMode="numeric"
            placeholder="验证码"
            maxLength={8}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/[^\d]/g, ''))}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && code.trim()) void handleVerify();
            }}
          />
          <button
            type="button"
            className="auth-resend"
            disabled={otpCountdown > 0 || sending}
            onClick={() => void handleSend()}
          >
            {otpCountdown > 0 ? `${otpCountdown}s` : '重发'}
          </button>
        </div>
      )}

      {errorMessage && <div className="auth-error">{errorMessage}</div>}

      {otpSentTo ? (
        <button
          type="button"
          className="auth-submit"
          disabled={!code.trim() || verifying}
          onClick={() => void handleVerify()}
        >
          {verifying ? '正在登录…' : '登录'}
        </button>
      ) : (
        <button type="button" className="auth-submit" disabled={!canSend} onClick={() => void handleSend()}>
          {sending ? '发送中…' : '获取验证码'}
        </button>
      )}

      {otpSentTo && (
        <button type="button" className="auth-back" onClick={() => useCloud.setState({ otpSentTo: null })}>
          ← 换一个邮箱
        </button>
      )}
    </Modal>
  );
}
