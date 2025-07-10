<script lang="ts">
	// Get current date for the "last updated" timestamp
	const currentDate = new Date().toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric'
	});
</script>

<div class="container mx-auto p-4 py-8 md:p-12">
	<div class="text-center">
		<h1 class="text-4xl font-bold">Terms of Service</h1>
		<p class="mx-auto mt-4 max-w-3xl text-lg text-base-content/80">
			This User Agreement governs your use of the BitTasker platform.
		</p>
		<p class="text-sm text-base-content/70 mt-2">Last Updated: {currentDate}</p>
	</div>

	<div class="prose mx-auto mt-8 max-w-4xl">
		<p>
			By accessing or using the BitTasker platform, you agree to be bound by these Terms of Service, our <a href="/privacy" class="link link-primary">Privacy Policy</a>, and all applicable laws and regulations. If you do not agree with any part of these terms, you may not use our services.
		</p>

		<h2>Definitions</h2>
		<p>
			Throughout these Terms of Service, when we say:
		</p>
		<ul>
			<li><strong>"BitTasker,"</strong> "we," "us," or "our" refers to BitTasker, Inc., the company that develops and maintains the BitTasker platform.</li>
			<li><strong>"Services"</strong> refers to the features and functions provided by the BitTasker platform.</li>
			<li><strong>"Platform"</strong> refers to our website, mobile applications, and other related services.</li>
			<li><strong>"User,"</strong> "you," or "your" refers to individuals who use our platform in any capacity.</li>
			<li><strong>"Poster"</strong> refers to users who post tasks requesting services.</li>
			<li><strong>"Tasker"</strong> refers to users who offer to perform services for Posters.</li>
			<li><strong>"Task Contract"</strong> refers to the agreement formed between a Poster and a Tasker when an offer is accepted.</li>
			<li><strong>"Nostr"</strong> refers to the decentralized protocol that powers communications and identity on the BitTasker platform.</li>
			<li><strong>"Bitcoin"</strong> refers to the cryptocurrency used for payments on the BitTasker platform, including on-chain, Lightning Network, and Liquid Network transactions.</li>
			<li><strong>"Service Fee"</strong> refers to the fee BitTasker charges for facilitating connections between Posters and Taskers.</li>
		</ul>

		<h2>1. Scope of BitTasker Services</h2>
		<div class="p-4 bg-base-100 rounded-box border border-base-300 mb-4">
			<p class="m-0 font-semibold">1.1 Basic Principles</p>
			<ul class="ml-5">
				<li>BitTasker provides a decentralized platform that enables Posters to publish task requests and Taskers to make offers to complete these tasks.</li>
				<li>The platform uses the Nostr protocol for identity, data storage, and communications, with Bitcoin as the payment method.</li>
				<li>When a Poster accepts a Tasker's offer, a Task Contract is created directly between these parties.</li>
				<li>Upon task completion and confirmation, Bitcoin funds are released from escrow to the Tasker.</li>
				<li>Both parties are encouraged to review and provide feedback after task completion.</li>
			</ul>
		</div>

		<h2>2. BitTasker's Role and Obligations</h2>
		<div class="p-4 bg-base-100 rounded-box border border-base-300 mb-4">
			<ul class="ml-5">
				<li>BitTasker provides the platform and technical infrastructure that enables the connection between Posters and Taskers.</li>
				<li>BitTasker only permits individuals over 18 years of age to become Users.</li>
				<li>BitTasker may refuse service or suspend accounts of users who violate these terms.</li>
				<li>As a decentralized application:
					<ul>
						<li>BitTasker does not store your private keys or have access to your encrypted messages.</li>
						<li>BitTasker cannot recover lost keys or passwords.</li>
						<li>BitTasker does not have the ability to reverse Bitcoin transactions.</li>
					</ul>
				</li>
				<li>BitTasker accepts no liability for any aspect of the interaction between Posters and Taskers, including but not limited to the description, performance, or delivery of services.</li>
				<li>BitTasker is not responsible for and does not warrant the truth or accuracy of any information provided by Users.</li>
				<li>The platform is provided "as is" and without any warranty or condition, express or implied.</li>
			</ul>
		</div>

		<h2>3. User Obligations</h2>
		<div class="p-4 bg-base-100 rounded-box border border-base-300 mb-4">
			<p class="m-0">You will at all times:</p>
			<ul class="ml-5">
				<li>Comply with these Terms of Service and all applicable laws and regulations.</li>
				<li>Only post accurate information on the BitTasker platform.</li>
				<li>Be aware of and comply with any laws that apply to you as a Poster or Tasker.</li>
				<li>Be responsible for the security of your own Nostr private keys and Bitcoin wallet.</li>
				<li>Not use the BitTasker platform for any illegal or immoral purpose.</li>
				<li>Not allow others to use your account or transfer your account to another person.</li>
			</ul>
			
			<p class="mt-4 mb-2">Any information you post on the BitTasker platform must not:</p>
			<ul class="ml-5">
				<li>Be false, inaccurate, misleading, or deceptive.</li>
				<li>Be fraudulent or involve counterfeit or stolen items.</li>
				<li>Infringe on any third party's intellectual property rights.</li>
				<li>Violate any applicable laws or regulations.</li>
				<li>Be defamatory, libelous, threatening, or harassing.</li>
				<li>Contain obscene or inappropriate material.</li>
				<li>Contain malicious code that could harm the platform or other users.</li>
			</ul>
		</div>

		<h2>4. Bitcoin Payments</h2>
		<div class="p-4 bg-base-100 rounded-box border border-base-300 mb-4">
			<ul class="ml-5">
				<li>Users acknowledge that Bitcoin transactions are irreversible and BitTasker cannot recover funds sent to incorrect addresses.</li>
				<li>BitTasker uses multi-signature escrow for task payments to provide security for both parties.</li>
				<li>When a Task Contract is created, the Poster must deposit the agreed Bitcoin amount into escrow.</li>
				<li>Service Fees are deducted from the task payment when funds are released from escrow.</li>
				<li>Bitcoin price volatility: Both parties acknowledge that the value of Bitcoin can fluctuate and agree that once a price is set in Bitcoin for a task, it will not be adjusted due to price fluctuations.</li>
				<li>Users are responsible for any taxes or regulatory compliance related to their Bitcoin transactions.</li>
			</ul>
		</div>

		<h2>5. Gamification and Dynamic Fee Structure</h2>
		<div class="p-4 bg-base-100 rounded-box border border-base-300 mb-4">
			<ul class="ml-5">
				<li>BitTasker implements a level-based system that rewards active users with benefits.</li>
				<li>Users can earn levels by successfully completing tasks (as Taskers) or hiring Taskers (as Posters).</li>
				<li>Higher levels may result in reduced Service Fees and additional platform privileges.</li>
				<li>The dynamic fee structure is designed to reward repeat business and active platform participation.</li>
				<li>BitTasker reserves the right to modify the gamification system and fee structure with appropriate notice to users.</li>
			</ul>
		</div>

		<h2>6. End-to-End Encryption and Privacy</h2>
		<div class="p-4 bg-base-100 rounded-box border border-base-300 mb-4">
			<ul class="ml-5">
				<li>All direct messages between users are end-to-end encrypted.</li>
				<li>BitTasker cannot access the content of your private conversations.</li>
				<li>Users are responsible for maintaining the security of their private keys.</li>
				<li>If you lose access to your private keys, BitTasker cannot recover your encrypted messages or account.</li>
				<li>For more details on our privacy practices, please see our <a href="/privacy" class="link link-primary">Privacy Policy</a>.</li>
			</ul>
		</div>

		<h2>7. Multi-Language Support</h2>
		<div class="p-4 bg-base-100 rounded-box border border-base-300 mb-4">
			<ul class="ml-5">
				<li>BitTasker offers automatic translation features to facilitate communication between users who speak different languages.</li>
				<li>While we strive for accuracy, users acknowledge that automatic translations may not be perfect and could sometimes lead to misunderstandings.</li>
				<li>In case of any discrepancy between different language versions of these Terms, the English version shall prevail.</li>
			</ul>
		</div>

		<h2>8. Dispute Resolution</h2>
		<div class="p-4 bg-base-100 rounded-box border border-base-300 mb-4">
			<ul class="ml-5">
				<li>In the event of a dispute between a Poster and a Tasker, both parties must attempt to resolve the issue directly through the platform's messaging system.</li>
				<li>If the parties cannot reach a resolution, our escrow system will be used to resolve the dispute.</li>
				<li>Escrow is implemented with 2:2 multisig wallets where only the client and tasker have the keys.</li>
				<li>Since BitTasker does not have access to your funds, we are unable to intervene in the event that a client and tasker have a dispute.</li>
			</ul>
		</div>

		<h2>9. Intellectual Property</h2>
		<div class="p-4 bg-base-100 rounded-box border border-base-300 mb-4">
			<ul class="ml-5">
				<li>The BitTasker name, logo, and platform are protected by intellectual property rights owned by BitTasker, Inc.</li>
				<li>You may not use our trademarks, logos, or other proprietary information without our prior written consent.</li>
				<li>Content you create and post on BitTasker remains your intellectual property, but you grant BitTasker a license to use, reproduce, and display such content for the purpose of providing and promoting the platform.</li>
				<li>This license ends when you delete your content from the platform, except in cases where your content has been shared with others who have not deleted it.</li>
			</ul>
		</div>

		<h2>10. Limitation of Liability</h2>
		<div class="p-4 bg-base-100 rounded-box border border-base-300 mb-4">
			<ul class="ml-5">
				<li>To the maximum extent permitted by law, BitTasker is not liable for any indirect, incidental, special, consequential, punitive, or exemplary damages.</li>
				<li>This includes but is not limited to damages for loss of profits, goodwill, use, data, or other intangible losses.</li>
				<li>BitTasker's total liability to you for any claims related to these Terms or your use of the platform shall not exceed the amount you have paid to BitTasker in service fees during the six months preceding the claim.</li>
				<li>These limitations do not apply to liability that cannot be excluded or limited by applicable law.</li>
			</ul>
		</div>

		<h2>11. Termination</h2>
		<div class="p-4 bg-base-100 rounded-box border border-base-300 mb-4">
			<ul class="ml-5">
				<li>BitTasker may terminate or suspend your access to the platform at any time, without prior notice, for conduct that we believe violates these Terms or is harmful to other users, us, or third parties.</li>
				<li>You may terminate your account at any time by discontinuing use of the platform.</li>
				<li>All provisions of these Terms which by their nature should survive termination shall survive, including ownership provisions, warranty disclaimers, indemnity, and limitations of liability.</li>
			</ul>
		</div>

		<h2>12. Changes to Terms</h2>
		<div class="p-4 bg-base-100 rounded-box border border-base-300 mb-4">
			<ul class="ml-5">
				<li>BitTasker may modify these Terms at any time by posting the revised terms on the platform.</li>
				<li>Your continued use of the platform after such changes constitutes your acceptance of the new Terms.</li>
				<li>If you do not agree to the modified terms, you should discontinue use of the platform.</li>
			</ul>
		</div>

		<h2>13. Governing Law</h2>
		<div class="p-4 bg-base-100 rounded-box border border-base-300 mb-4">
			<ul class="ml-5">
				<li>These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which BitTasker is incorporated, without regard to its conflict of law provisions.</li>
				<li>Any legal action or proceeding arising out of these Terms shall be brought exclusively in the courts located in that jurisdiction.</li>
			</ul>
		</div>

		<h2>14. Contact Information</h2>
		<div class="p-4 bg-base-100 rounded-box border border-base-300 mb-4">
			<p>
				If you have any questions about these Terms, please contact us at <a href="/contact" class="link link-primary">our contact page</a>.
			</p>
		</div>
	</div>
</div>

