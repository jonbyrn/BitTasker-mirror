import type { LearnPageContent } from '$lib/types/learn';

export const content: LearnPageContent = {
	hero: {
		title: 'How to Avoid Crypto Scams: Complete Guide',
		subtitle:
			'Identify phishing, fake wallets, Ponzi schemes, and social engineering attacks before they cost you Bitcoin'
	},
	answerBlock:
		'Crypto scams cost victims billions every year through phishing, fake wallet downloads, Ponzi schemes, and social engineering. The most common attacks include fake wallet websites that steal your seed phrase, impersonation scams where attackers pose as support staff, and "too good to be true" investment schemes that promise guaranteed returns. Protect yourself by always downloading wallets from official websites (never search engine ads), verifying wallet checksums, never sharing your seed phrase with anyone, and treating every unsolicited DM or email with extreme suspicion. Hardware wallets and BIP39 passphrases provide the strongest defense against most scam vectors. If something feels rushed or pressured, stop — legitimate services never demand immediate action.',
	sections: [
		{
			heading: 'What are the most common crypto scams?',
			body: 'Phishing attacks: Scammers create websites that look identical to real wallet or exchange sites (e.g., "ledger-wallet.com" instead of "ledger.com"). They prompt you to enter your seed phrase, which they capture and use to drain your funds. Fake wallet apps: Malicious apps on app stores mimic legitimate wallets. Always verify the developer name and download count before installing. Check the official website for the correct app store link. Ponzi and pyramid schemes: Projects promising guaranteed daily returns (e.g., "earn 1% per day") are almost always Ponzi schemes. New investor money pays existing investors until the scheme collapses. Rug pulls: Developers create a token or project, attract investment, then disappear with the funds. Common in DeFi and ICO spaces. Giveaway scams: Social media posts claiming "send 1 BTC, receive 2 BTC" are always scams. No legitimate service works this way. Romance and relationship scams: Attackers build trust over weeks or months, then introduce a "great investment opportunity." These are devastatingly effective.'
		},
		{
			heading: 'How do you verify wallet downloads and checksums?',
			body: "Always download wallet software directly from the manufacturer's official website — not from search engine ads, social media links, or third-party download sites. After downloading, verify the file integrity using checksums. Most wallet manufacturers publish SHA-256 checksums on their website or GitHub releases. On macOS/Linux, run: shasum -a 256 [filename]. Compare the output against the published checksum. On Windows, run: certutil -hashfile [filename] SHA256. If the hashes match, the file is genuine. If they differ, the file has been tampered with — delete it immediately. For hardware wallets, buy only from the manufacturer (ledger.com, trezor.io, coinkite.com, foundation.xyz, bitbox.swiss). Never buy from Amazon, eBay, or resellers where devices may be pre-configured with attacker-controlled seed phrases."
		},
		{
			heading: 'What social engineering attacks target crypto users?',
			body: 'Fake support agents: Attackers join Telegram, Discord, or Twitter groups and pose as official support. They ask you to "verify" your wallet by entering your seed phrase on a website, or they send you a malicious link. Legitimate support will never ask for your seed phrase. DM scams: Unsolicited direct messages on any platform offering help, investment advice, or "exclusive opportunities" are almost always scams. Block and report. Impersonation: Attackers clone the profiles of known crypto figures, change one character in the username, and post fake giveaways or investment tips. Always verify the account\'s history and verification status. Urgency and pressure: Scammers create artificial urgency — "act now or lose your funds," "your account will be suspended," "limited time offer." Legitimate services give you time to verify and think. Fake customer support websites: Scammers create support websites for exchanges and wallets that appear in search results. The "support agent" then asks for your seed phrase or login credentials to "help" you.'
		},
		{
			heading: 'What red flags indicate a crypto scam?',
			body: 'Guaranteed returns: No legitimate investment guarantees returns. If someone promises guaranteed profits, it is a scam. Pressure to act immediately: Scammers use countdown timers, "limited availability," and fear tactics to prevent you from thinking clearly. Requests for your seed phrase: No legitimate service, support agent, or application will ever ask for your seed phrase. If anyone asks for it, it is a scam. Unsolicited contact: If someone contacts you out of the blue with an opportunity, be extremely skeptical. Poor grammar and spelling: Many scam operations are run from countries where English is not the primary language. Professional services invest in polished communication. Anonymous teams: Legitimate projects have identifiable, public-facing teams. If the team is anonymous or uses stock photos, proceed with extreme caution. New or recently created social media accounts: Scammers create fresh accounts to promote schemes. Check account age and activity history. Too good to be true: If the opportunity sounds too good to be true, it is. Trust your instincts.'
		},
		{
			heading: 'How do you protect yourself from crypto scams?',
			body: "Use a hardware wallet: Hardware wallets (Coldcard, Trezor, Ledger) keep your keys offline and are resistant to most online scams. Even if you accidentally visit a phishing site, the hardware wallet cannot leak your seed phrase. Never share your seed phrase: Store it on steel, never digitally, and never enter it into any website or app unless you are absolutely certain it is your wallet's official recovery process. Verify every URL: Before entering any credentials, verify the URL matches the official site exactly. Check for HTTPS, correct spelling, and the right domain. Bookmark official sites. Test transactions first: Before sending large amounts, send a small test transaction to verify the address is correct. Double-check the full address on your hardware wallet's screen. Enable BIP39 passphrase: Even if your seed phrase is compromised, the passphrase protects your main funds. Store the passphrase separately. Use unique passwords and 2FA: Use a password manager and enable two-factor authentication on every exchange and service account. Use an authenticator app, not SMS."
		},
		{
			heading: 'How do you report a crypto scam?',
			body: "If you have been scammed, report it immediately. In the United States, file a complaint with the FBI's Internet Crime Complaint Center (ic3.gov) and the Federal Trade Commission (reportfraud.ftc.gov). In the UK, report to Action Fraud. In the EU, contact your national cybercrime unit. Report fake social media accounts to the platform (Twitter, Telegram, Discord). If you lost funds to a scam, report the receiving addresses to blockchain analytics firms like Chainalysis or Elliptic — they work with law enforcement to trace stolen funds. Join communities like r/BitcoinScams on Reddit to warn others. Prevention is the best defense — share this guide with anyone new to Bitcoin."
		},
		{
			heading: 'How does BitTasker protect you from scams?',
			body: "BitTasker mitigates common scam vectors through its architecture. Payments flow via Lightning Network to your connected wallet — BitTasker never custodies your funds or asks for your seed phrase. The platform uses Nostr identity, meaning there are no email/password credentials to phish. Smart contract escrow on RGB ensures that both parties fulfill their obligations before funds move. However, no platform can eliminate all risk. Always verify URLs, never share your seed phrase, and treat unsolicited DMs with suspicion. BitTasker's support will never ask for your private key or seed phrase."
		}
	],
	faq: [
		{
			question: 'What is the most common crypto scam?',
			answer:
				'Phishing attacks are the most common, where scammers create fake wallet or exchange websites to steal your seed phrase. Social engineering (fake support, DM scams) is the second most common vector. Both rely on tricking you into revealing your private keys.'
		},
		{
			question: 'Can I recover funds lost to a crypto scam?',
			answer:
				'Bitcoin transactions are irreversible, so recovery is difficult. Report to law enforcement (FBI IC3, Action Fraud), contact the exchange if funds were sent there, and report the scam to blockchain analytics firms. Prevention through security practices is far more effective than recovery.'
		},
		{
			question: 'How do I know if a wallet download is legitimate?',
			answer:
				"Download only from the manufacturer's official website. Verify the SHA-256 checksum against the published hash. Never download from search engine ads, social media links, or third-party sites. For hardware wallets, buy directly from the manufacturer."
		},
		{
			question: 'Is it safe to click links in crypto Telegram groups?',
			answer:
				'No. Telegram is rife with scam links, fake giveaways, and impersonation accounts. Never click links from strangers, even in "official" groups. Always verify links independently by typing the URL directly into your browser.'
		},
		{
			question: 'What should I do if I shared my seed phrase?',
			answer:
				'Immediately transfer all funds to a new wallet with a fresh seed phrase. Time is critical — the scammer may already be monitoring your address. Use a different device if possible, as your current device may be compromised. If you used a BIP39 passphrase, your funds are safer.'
		},
		{
			question: 'Are airdrop scams dangerous?',
			answer:
				'Yes. Airdrop scams ask you to connect your wallet or enter your seed phrase on a fake website to "claim" free tokens. The wallet draining contract steals your funds. Never enter your seed phrase anywhere to claim an airdrop. Legitimate airdrops do not require this.'
		},
		{
			question: 'Can a hardware wallet protect me from all scams?',
			answer:
				'A hardware wallet protects against most online attacks — even if you visit a phishing site, your seed phrase stays on the device. However, it cannot protect against physical theft, supply chain attacks (tampered devices), or social engineering that tricks you into signing a malicious transaction.'
		}
	],
	bitTaskerCta: {
		heading: 'Freelance Safely with BitTasker',
		body: 'BitTasker uses Nostr identity and smart contract escrow — no email/password to phish, no custodial funds to lose. Payments flow directly to your wallet via Lightning.',
		buttonText: 'Get Started',
		buttonHref: '/auth/signup'
	},
	howTo: {
		name: 'How to Avoid Cryptocurrency Scams',
		description:
			'Step-by-step guide to identifying and avoiding common crypto scams, phishing attacks, and social engineering.',
		totalTime: 'PT10M',
		steps: [
			{
				name: 'Verify wallet downloads from official sources',
				text: "Download wallet software only from the manufacturer's official website. Verify SHA-256 checksums after downloading to ensure the file has not been tampered with."
			},
			{
				name: 'Never share seed phrase',
				text: 'Never enter your seed phrase into any website, app, or message. No legitimate service, support agent, or application will ever ask for it. Store it on steel, never digitally.'
			},
			{
				name: 'Check URLs carefully',
				text: 'Before entering any credentials, verify the URL matches the official site exactly. Check for HTTPS, correct spelling, and the right domain. Bookmark official sites.'
			},
			{
				name: 'Verify transaction details before signing',
				text: "Always double-check the recipient address, amount, and fees on your hardware wallet's screen before confirming. Never trust clipboard-pasted addresses without verification."
			},
			{
				name: 'Use hardware wallet for large amounts',
				text: 'Store significant Bitcoin holdings on a hardware wallet that keeps keys offline. Hardware wallets protect against most online scams even if you accidentally visit a phishing site.'
			}
		]
	}
};
