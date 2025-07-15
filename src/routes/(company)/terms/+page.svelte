<script lang="ts">
	import { darkMode } from '$lib/stores/theme.store';
	</script>

<div class="container mx-auto p-4 py-8 md:p-12">
	<div class="text-center">
		<img
		src={$darkMode
			? '/images/Bittasker-logo-tagline-dark.svg'
			: '/images/Bittasker-logo-tagline-light.svg'}
		alt="BitTasker Logo"
		class="mx-auto mb-4 block md:min-w-[500px]"
		/>
		<h1 class="text-4xl font-bold">Terms of Service</h1>
		<p class="mx-auto mt-4 max-w-3xl text-lg text-base-content/80">
			This User Agreement governs your use of the BitTasker platform.
		</p>
		<p class="text-sm text-base-content/70 mt-2">Last Updated: July 13, 2025</p>
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
			<li><strong>"BitTasker,"</strong> "we," "us," or "our" refers to BitTasker, the company that develops and maintains the BitTasker platform.</li>
			<li><strong>"Services"</strong> refers to the features and functions provided by the BitTasker platform.</li>
			<li><strong>"Platform"</strong> refers to our website, mobile applications, and other related services.</li>
			<li><strong>"User,"</strong> "you," or "your" refers to individuals who use our platform in any capacity.</li>
			<li><strong>"Tasker,"</strong> refers to users who post tasks requesting services.</li>
			<li><strong>"Taskee"</strong> refers to users who offer to perform services for Taskers.</li>
			<li><strong>"Task Contract"</strong> refers to the agreement formed between a Tasker and a Taskee when an offer is accepted.</li>
			<li><strong>"Nostr"</strong> refers to the decentralized protocol that powers communications and identity on the BitTasker platform.</li>
			<li><strong>"Bitcoin"</strong> refers to the cryptocurrency used for payments on the BitTasker platform, including on-chain, Lightning Network, and Liquid Network transactions.</li>
			<li><strong>"Service Fee"</strong> refers to the fee BitTasker charges for facilitating connections between Taskers and Taskees.</li>
		</ul>

		<h2>1. Scope of BitTasker Services</h2>
		<div class="p-4 bg-base-100 rounded-box border border-base-300 mb-4">
			<p class="m-0 font-semibold">1.1 Basic Principles</p>
			<ul class="ml-5">
				<li>BitTasker provides a decentralized platform that enables Taskers to publish task requests and Taskees to make offers to complete these tasks.</li>
				<li>The platform uses the Nostr protocol for identity, data storage, and communications, with Bitcoin and fiat as payment methods.</li>
				<li>When a Tasker accepts a Taskee's offer, a Task Contract is created directly between these parties.</li>
				<li>Upon task completion and confirmation, funds are released from escrow to the Taskee.</li>
				<li>Both parties are encouraged to review and provide feedback after task completion, to help the community.</li>
			</ul>
		</div>

		<h2>2. BitTasker's Role and Obligations</h2>
		<div class="p-4 bg-base-100 rounded-box border border-base-300 mb-4">
			<ul class="ml-5">
				<li>BitTasker provides the platform and technical infrastructure that enables the connection between Taskers and Taskees.</li>
				<li>BitTasker only permits individuals over 18 years of age to become Users.</li>
				<li>BitTasker may refuse service or suspend accounts of users who violate these terms.</li>
				<li>As a decentralized application:
					<ul>
						<li>BitTasker does not store your private keys or have access to your encrypted messages.</li>
						<li>BitTasker cannot recover lost keys or passwords.</li>
						<li>BitTasker does not have the ability to reverse, or intervene, in transactions.</li>
					</ul>
				</li>
				<li>BitTasker accepts no liability for any aspect of the interaction between Taskers and Taskees, including but not limited to the description, performance, or delivery of services.</li>
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
				<li>Be aware of and comply with any laws that apply to you as a Tasker or Taskee.</li>
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
				<li>When a Task Contract is created, the Tasker must deposit the agreed amount into escrow.</li>
				<li>Service Fees are deducted from the task payment when funds are released from escrow.</li>
				<li>Bitcoin price volatility: Both parties acknowledge that the value of Bitcoin can fluctuate and agree that once a price is set in Bitcoin for a task, it will not be adjusted due to price fluctuations.</li>
				<li>Users are responsible for any taxes or regulatory compliance related to their transactions.</li>
			</ul>
		</div>

		<h2>5. Dynamic Fee Structure</h2>
		<div class="p-4 bg-base-100 rounded-box border border-base-300 mb-4">
			<ul class="ml-5">
				<li>BitTasker implements a level-based system that rewards active users with benefits.</li>
				<li>Users can earn levels by successfully completing tasks (as Taskees) or hiring Taskees (as Taskers).</li>
				<li>Higher levels may result in reduced Service Fees and additional platform privileges.</li>
				<li>The dynamic fee structure is designed to reward repeat business and active platform participation.</li>
				<li>BitTasker reserves the right to modify the fee structure at any time.</li>
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
				<li>To avoid any confusion, it is recommended to be as clear as possible in communications.</li>
			</ul>
		</div>

		<h2>8. Dispute Resolution</h2>
		<div class="p-4 bg-base-100 rounded-box border border-base-300 mb-4">
			<ul class="ml-5">
				<li>In the event of a dispute between a Tasker and a Taskee, both parties must attempt to resolve the issue directly through the platform's messaging system.</li>
				<li>If the parties cannot reach a resolution, our escrow system will be used to resolve the dispute.</li>
				<li>Escrow is implemented with 2:2 multisig wallets where only the tasker and taskee have the keys.</li>
				<li>Since BitTasker does not have access to your funds, we are unable to intervene in the event that a tasker and taskee have a dispute.</li>
				<li>See our detailed <a href="/escrow"  class="link link-primary">escrow page</a> for more information.</li>
			</ul>
		</div>

		<h2>9. Intellectual Property</h2>
		<div class="p-4 bg-base-100 rounded-box border border-base-300 mb-4">
			<ul class="ml-5">
				<li>The BitTasker name, logo, and platform are protected by intellectual property rights owned by BitTasker.</li>
				<li>You may not use our trademarks, logos, or other proprietary information without our prior written consent.</li>
				<li>Content you create and post on BitTasker remains your intellectual property, but you grant BitTasker a license to use, store, reproduce, and display such content for the purpose of providing and promoting the platform.</li>
				<li>This license is perpetual and ends when you delete your content from the platform, except in cases where your content has been shared with others who have not deleted it.</li>
			</ul>
		</div>

		<h2>10. Limitation of Liability</h2>
		<div class="p-4 bg-base-100 rounded-box border border-base-300 mb-4">
			<ul class="ml-5">
				<li>To the maximum extent permitted by law, BitTasker and its affiliates, officers, directors, employees, agents, and licensors shall not be liable for any indirect, incidental, special, consequential, punitive, or exemplary damages, including but not limited to damages for loss of profits, goodwill, use, data, or other intangible losses, arising out of or relating to your use of the platform.</li>
				<li>This limitation applies whether the alleged liability is based on contract, tort, negligence, strict liability, or any other basis, even if BitTasker has been advised of the possibility of such damage.</li>
				<li>BitTasker's total liability to you for any and all claims arising out of or relating to these Terms or your use of the platform shall not exceed the greater of (a) the amount you have paid to BitTasker in service fees during the six months preceding the claim, or (b) one hundred dollars ($100).</li>
				<li>Some jurisdictions do not allow the exclusion or limitation of liability for consequential or incidental damages, so the above limitation may not apply to you. In such jurisdictions, our liability is limited to the greatest extent permitted by law.</li>
				<li>You acknowledge that the fees charged by BitTasker reflect the allocation of risk set forth in these Terms and that BitTasker would not enter into these Terms without these limitations on its liability.</li>
			</ul>
		</div>

		<h2>11. Indemnification</h2>
		<div class="p-4 bg-base-100 rounded-box border border-base-300 mb-4">
			<ul class="ml-5">
				<li>You agree to defend, indemnify, and hold harmless BitTasker, its affiliates, officers, directors, employees, agents, and licensors from and against any and all claims, damages, obligations, losses, liabilities, costs, and expenses (including reasonable attorney's fees) arising from:</li>
				<li style="margin-left: 1.5rem;">Your use of the platform or services;</li>
				<li style="margin-left: 1.5rem;">Your violation of these Terms;</li>
				<li style="margin-left: 1.5rem;">Your violation of any third party's rights, including intellectual property rights;</li>
				<li style="margin-left: 1.5rem;">Your conduct in connection with the platform;</li>
				<li style="margin-left: 1.5rem;">Any Task Contract you enter into;</li>
				<li style="margin-left: 1.5rem;">Any content you post or transmit through the platform.</li>
				<li>BitTasker reserves the right to assume the exclusive defense and control of any matter otherwise subject to indemnification by you, in which event you will cooperate with BitTasker in asserting any available defenses.</li>
			</ul>
		</div>

		<h2>12. Class Action Waiver</h2>
		<div class="p-4 bg-base-100 rounded-box border border-base-300 mb-4">
			<ul class="ml-5">
				<li><strong>Individual Disputes Only:</strong> You and BitTasker agree that any dispute resolution proceeding will be conducted only on an individual basis and not in a class, consolidated, or representative action.</li>
				<li><strong>No Class Actions:</strong> You agree not to participate in or attempt to participate in a class action, collective action, or other representative action against BitTasker.</li>
				<li><strong>Waiver of Jury Trial:</strong> You and BitTasker each waive any right to a jury trial in any proceeding arising out of or relating to these Terms.</li>
				<li><strong>Severability:</strong> If any portion of this arbitration or class action waiver provision is deemed invalid or unenforceable, the remainder of this section shall remain in force. However, if the class action waiver is found to be invalid or unenforceable, then the entirety of this arbitration provision shall be null and void.</li>
				<li><strong>Opt-Out:</strong> You may opt out of this arbitration agreement within 30 days of first accepting these Terms by sending written notice to our contact page with your name, address, and a clear statement that you wish to opt out of the arbitration agreement.</li>
			</ul>
		</div>

		<h2>13. Termination</h2>
		<div class="p-4 bg-base-100 rounded-box border border-base-300 mb-4">
			<ul class="ml-5">
				<li>BitTasker may terminate or suspend your access to the platform at any time, with or without cause, and with or without notice, for conduct that we believe violates these Terms, is harmful to other users, us, or third parties, or for any other reason in our sole discretion.</li>
				<li>You may terminate your account at any time by discontinuing use of the platform and, if applicable, closing your account through the platform settings.</li>
				<li>Upon termination, your right to use the platform will cease immediately. However, any outstanding Task Contracts and related obligations will survive termination.</li>
				<li>All provisions of these Terms which by their nature should survive termination shall survive, including but not limited to ownership provisions, warranty disclaimers, indemnity, limitations of liability, dispute resolution, and class action waiver provisions.</li>
				<li>BitTasker shall not be liable to you or any third party for any termination of your access to the platform.</li>
			</ul>
		</div>

		<h2>14. Disclaimers and Warranties</h2>
		<div class="p-4 bg-base-100 rounded-box border border-base-300 mb-4">
			<ul class="ml-5">
				<li><strong>No Warranties:</strong> The platform is provided "as is" and "as available" without warranties of any kind, either express or implied, including but not limited to implied warranties of merchantability, fitness for a particular purpose, title, and non-infringement.</li>
				<li><strong>No Guarantee of Service:</strong> BitTasker does not warrant that the platform will be uninterrupted, error-free, or completely secure. We do not warrant that defects will be corrected or that the platform is free of viruses or other harmful components.</li>
				<li><strong>Third-Party Content:</strong> BitTasker disclaims all warranties regarding any third-party content, including content posted by users. We do not endorse, warrant, or assume responsibility for any third-party content.</li>
				<li><strong>Cryptocurrency Risks:</strong> You acknowledge that cryptocurrency transactions involve inherent risks, including but not limited to price volatility, regulatory changes, and technical failures. BitTasker makes no representations or warranties regarding the value, security, or suitability of any cryptocurrency.</li>
				<li><strong>User Interactions:</strong> BitTasker does not warrant the truth, accuracy, or reliability of any information provided by users or the quality of services performed by Taskees.</li>
			</ul>
		</div>

		<h2>15. Force Majeure</h2>
		<div class="p-4 bg-base-100 rounded-box border border-base-300 mb-4">
			<ul class="ml-5">
				<li>BitTasker shall not be liable for any failure or delay in performance under these Terms that is due to fire, flood, earthquake, pandemic, government action, war, terrorism, network failures, or other causes beyond BitTasker's reasonable control.</li>
				<li>In the event of a force majeure event, BitTasker's obligations under these Terms will be suspended for the duration of such event.</li>
			</ul>
		</div>

		<h2>16. Changes to Terms</h2>
		<div class="p-4 bg-base-100 rounded-box border border-base-300 mb-4">
			<ul class="ml-5">
				<li>BitTasker may modify these Terms at any time by posting the revised terms on the platform with a new "Last Updated" date.</li>
				<li>Your continued use of the platform after such changes constitutes your acceptance of the new Terms.</li>
				<li>If you do not agree to the modified terms, you must discontinue use of the platform and may be entitled to a refund of any prepaid fees, subject to these Terms.</li>
			</ul>
		</div>

		<h2>17. Governing Law</h2>
		<div class="p-4 bg-base-100 rounded-box border border-base-300 mb-4">
			<ul class="ml-5">
				<li>These Terms shall be governed by and construed in accordance with the laws of El Salvador, without regard to its conflict of law provisions.</li>
				<li>Any legal action or proceeding arising out of these Terms that is not subject to arbitration shall be brought exclusively in the courts located in El Salvador, and you consent to the jurisdiction of such courts.</li>
				<li>Notwithstanding the foregoing, certain consumer protection laws may apply to your use of the platform regardless of this governing law provision.</li>
			</ul>
		</div>

		<h2>18. Severability</h2>
		<div class="p-4 bg-base-100 rounded-box border border-base-300 mb-4">
			<ul class="ml-5">
				<li>If any provision of these Terms is held to be invalid, illegal, or unenforceable, the validity, legality, and enforceability of the remaining provisions shall not be affected or impaired thereby.</li>
				<li>In such case, the parties shall replace the invalid, illegal, or unenforceable provision with a valid, legal, and enforceable provision that achieves the same or similar economic effect.</li>
			</ul>
		</div>

		<h2>19. Entire Agreement</h2>
		<div class="p-4 bg-base-100 rounded-box border border-base-300 mb-4">
			<ul class="ml-5">
				<li>These Terms, together with our Privacy Policy and any additional terms that apply to specific features of the platform, constitute the entire agreement between you and BitTasker regarding your use of the platform.</li>
				<li>These Terms supersede all prior agreements, understandings, and communications between you and BitTasker regarding the subject matter hereof.</li>
			</ul>
		</div>

		<h2>20. Contact Information</h2>
		<div class="p-4 bg-base-100 rounded-box border border-base-300 mb-4">
			<p>
				If you have any questions about these Terms, please contact us at <a href="/contact" class="link link-primary">our contact page</a>.
			</p>
			<p class="mt-2">
				For legal notices, including opt-out notices for arbitration, please send written correspondence to: BitTasker Legal Department, via our contact page.
			</p>
		</div>
	</div>
</div>

