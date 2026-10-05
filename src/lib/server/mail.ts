import nodemailer, { type Transporter } from 'nodemailer';
import { config } from './config';

/**
 * Mail goes to an SMTP relay on the local network, which sends it on. No auth on the hop: the
 * relay is expected to trust the app's network and accept the From domain.
 */
let transport: Transporter | null = null;

function getTransport() {
	if (!transport) {
		const { host, port } = config.smtp;
		transport = nodemailer.createTransport({
			host,
			port,
			secure: false,
			// A local relay usually offers STARTTLS with a self-signed cert.
			tls: { rejectUnauthorized: false },
			pool: true,
			maxConnections: 2
		});
	}
	return transport;
}

export function escapeHtml(s: string): string {
	return s.replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
	);
}

function layout(body: string, footer = ''): string {
	return `<!doctype html><html><body style="margin:0;background:#0d0d10;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e8e6e3">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d10"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#17171c;border-radius:12px;overflow:hidden">
<tr><td style="padding:20px 24px;border-bottom:1px solid #2a2a31">
<span style="font-size:26px;letter-spacing:3px;font-weight:800;color:#f5c518">FRAMED</span>
<span style="font-size:14px;font-weight:700;color:#9b9aa3;margin-left:4px">2.0</span>
</td></tr>
<tr><td style="padding:24px">${body}</td></tr>
</table>
<div style="max-width:560px;padding:16px 8px;font-size:12px;color:#6f6e78;line-height:1.5">${footer}</div>
</td></tr></table></body></html>`;
}

function button(href: string, label: string): string {
	return `<a href="${escapeHtml(href)}" style="display:inline-block;background:#f5c518;color:#111;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:8px">${escapeHtml(label)}</a>`;
}

export async function sendLoginEmail(to: string, link: string) {
	const html = layout(
		`<p style="margin:0 0 16px;font-size:16px;line-height:1.5">Here is your link to sign in to Framed 2.0. It works once and expires in 30 minutes.</p>
<p style="margin:0 0 20px">${button(link, 'Sign in')}</p>
<p style="margin:0;font-size:13px;color:#9b9aa3;word-break:break-all">Or paste this into your browser:<br>${escapeHtml(link)}</p>`,
		`You got this because someone asked to sign in to ${escapeHtml(config.origin)} with this address. If it wasn't you, ignore it.`
	);
	await getTransport().sendMail({
		from: config.smtp.from,
		to,
		subject: 'Your Framed 2.0 sign-in link',
		text: `Sign in to Framed 2.0:\n\n${link}\n\nThe link works once and expires in 30 minutes. If you didn't ask for it, ignore this email.`,
		html
	});
}

export interface DailyEmail {
	to: string;
	number: number;
	dateLabel: string;
	frameUrl: string | null;
	playUrl: string;
	unsubscribeUrl: string;
	streak: number;
}

export async function sendDailyEmail(m: DailyEmail) {
	const streakLine =
		m.streak > 0
			? `<p style="margin:0 0 16px;font-size:14px;color:#9b9aa3">You're on a ${m.streak}-day streak. Keep it going.</p>`
			: '';
	const frame = m.frameUrl
		? `<a href="${escapeHtml(m.playUrl)}"><img src="${escapeHtml(m.frameUrl)}" alt="Today's first frame" width="512" style="display:block;width:100%;max-width:512px;height:auto;border-radius:8px;margin:0 0 20px;border:0"></a>`
		: '';
	const html = layout(
		`<p style="margin:0 0 4px;font-size:13px;letter-spacing:1px;text-transform:uppercase;color:#9b9aa3">${escapeHtml(m.dateLabel)}</p>
<h1 style="margin:0 0 16px;font-size:22px">Framed 2.0 #${m.number} is ready</h1>
${frame}
<p style="margin:0 0 16px;font-size:16px;line-height:1.5">Can you name the movie from this frame? You get six frames and six guesses.</p>
${streakLine}
<p style="margin:0">${button(m.playUrl, 'Play today’s puzzle')}</p>`,
		`You get this because you asked for the daily puzzle at ${escapeHtml(config.origin)}. <a href="${escapeHtml(m.unsubscribeUrl)}" style="color:#9b9aa3">Unsubscribe</a>.`
	);
	await getTransport().sendMail({
		from: config.smtp.from,
		to: m.to,
		subject: `Framed 2.0 #${m.number} – ${m.dateLabel}`,
		text: `Framed 2.0 #${m.number} is ready.\n\nPlay: ${m.playUrl}\n\nUnsubscribe: ${m.unsubscribeUrl}`,
		html,
		headers: {
			'List-Unsubscribe': `<${m.unsubscribeUrl}>`
		}
	});
}
