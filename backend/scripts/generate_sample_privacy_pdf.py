"""One-off generator: sample privacy policy PDF with intentional GDPR gaps."""

from pathlib import Path

from fpdf import FPDF

OUT = Path(r"C:\Users\emman\Downloads\Sample_Privacy_Policy_GDPR_Gaps.pdf")


class Doc(FPDF):
    def footer(self) -> None:
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 10, f"Page {self.page_no()}", align="C")


def write_block(pdf: Doc, text: str, *, bold: bool = False, size: int = 11) -> None:
    pdf.set_x(pdf.l_margin)
    pdf.set_font("Helvetica", "B" if bold else "", size)
    pdf.multi_cell(pdf.epw, 6 if size <= 11 else 8, text)
    pdf.ln(2)


def main() -> None:
    pdf = Doc()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()
    write_block(pdf, "Acme Corp Privacy Policy", bold=True, size=18)
    pdf.set_text_color(80, 80, 80)
    write_block(pdf, "Effective date: January 1, 2024  |  Version 1.2", size=11)
    pdf.set_text_color(0, 0, 0)
    pdf.ln(2)

    sections = [
        (
            "1. Introduction",
            'Acme Corp ("we", "us") collects and processes personal data of customers, '
            "employees, and website visitors. This policy describes how we handle that "
            "information. We operate globally and transfer data between our offices in "
            "the United States, the United Kingdom, and the Philippines.",
        ),
        (
            "2. Data We Collect",
            "We collect names, email addresses, phone numbers, billing addresses, IP "
            "addresses, device identifiers, and browsing history. For employees we also "
            "collect Social Security / national ID numbers, bank account details, health "
            "insurance enrollment data, and performance reviews. We may collect any other "
            "information users choose to provide in support tickets.",
        ),
        (
            "3. Purposes of Processing",
            "We use personal data to provide our products, process payments, send "
            "marketing emails, improve our services, and for any other purpose we deem "
            "useful for the business. We may also use employee health data to manage "
            "workplace wellness programs.",
        ),
        (
            "4. Legal Basis",
            "We process personal data based on our legitimate business interests. Where "
            "required, we may ask for consent, but consent is not required for most "
            "processing activities described in this policy.",
        ),
        (
            "5. Sharing and Transfers",
            "We share personal data with payment processors, cloud hosting providers, "
            "analytics vendors, and affiliated companies. Data may be transferred to the "
            "United States without additional safeguards. We do not publish a list of "
            "subprocessors.",
        ),
        (
            "6. Retention",
            "We retain personal data for as long as needed for our business purposes. "
            "Customer records may be kept indefinitely. Backup copies are retained "
            "without a defined deletion schedule.",
        ),
        (
            "7. Security",
            "We take reasonable steps to protect personal data. Passwords may be stored "
            "using reversible encoding for account recovery. Access to production "
            "databases is available to all engineering staff. We do not currently "
            "maintain an incident response plan.",
        ),
        (
            "8. Your Rights",
            "Depending on your location, you may have rights regarding your personal "
            "data. To exercise rights, contact support@acme.example. We aim to respond "
            "when practical. We do not currently support automated data portability "
            "exports.",
        ),
        (
            "9. Children",
            "Our services are not directed to children under 13. We do not knowingly "
            "verify ages of users.",
        ),
        (
            "10. Changes",
            "We may update this policy at any time without notice. Continued use of the "
            "service constitutes acceptance of the revised policy.",
        ),
        (
            "11. Contact",
            "Questions about this policy can be sent to privacy@acme.example. We have "
            "not appointed a Data Protection Officer.",
        ),
    ]

    for title, body in sections:
        write_block(pdf, title, bold=True, size=13)
        write_block(pdf, body, size=11)
        pdf.ln(2)

    pdf.add_page()
    write_block(pdf, "Appendix A - Cookie Notice (summary)", bold=True, size=14)
    write_block(
        pdf,
        "We use essential, analytics, and advertising cookies. Analytics and "
        "advertising cookies are set by default on first visit. Users can disable "
        "cookies in their browser; we do not provide an in-product consent banner or "
        "granular cookie controls.",
        size=11,
    )
    pdf.ln(2)
    write_block(pdf, "Appendix B - Known gaps (for auditor testing)", bold=True, size=14)
    write_block(
        pdf,
        "This sample intentionally omits or weakens: lawful basis specificity, "
        "retention schedules, international transfer safeguards (SCCs/adequacy), DPO "
        "appointment, breach notification timelines, DPIA process, data subject rights "
        "SLAs, subprocessors transparency, encryption at rest, least-privilege access, "
        "and cookie consent. Use it to validate GDPR / SOC2 style audits.",
        size=11,
    )

    pdf.output(str(OUT))
    print(OUT)
    print("bytes", OUT.stat().st_size)


if __name__ == "__main__":
    main()
