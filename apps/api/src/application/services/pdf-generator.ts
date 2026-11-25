import puppeteer from 'puppeteer';
import handlebars from 'handlebars';
import fs from 'fs/promises';
import path from 'path';
import { AILayer } from '@verisphere/ai-layer';

export class PdfGeneratorService {
  public async generateReport(job: any): Promise<Buffer> {
    const templatePath = path.join(__dirname, '../../templates/report.hbs');
    const templateContent = await fs.readFile(templatePath, 'utf-8');
    
    const template = handlebars.compile(templateContent);
    
    // Parse data safely
    const candidateName = job.candidate ? `${job.candidate.firstName} ${job.candidate.lastName}` : "Unknown Candidate";
    const candidateEmail = job.candidate?.email || "N/A";
    const githubUrl = job.candidate?.githubUrl || "#";
    const githubUsername = githubUrl.split('/').pop() || "Unknown";
    
    let reportData: any = {};
    let githubMetrics: any = {};
    let resumeData: any = {};
    
    if (job.report) {
      reportData = job.report;
    }
    if (job.githubMetricsJson) try { githubMetrics = JSON.parse(job.githubMetricsJson); } catch (e) {}
    if (job.resumeDataJson) try { resumeData = JSON.parse(job.resumeDataJson); } catch (e) {}
    
    let certificateData: any = {};
    if (job.certificateDataJson) try { certificateData = JSON.parse(job.certificateDataJson); } catch (e) {}

    const aiLayer = new AILayer();
    const aiReport = await aiLayer.generateProfessionalReport({
      jobId: job.id,
      candidate: job.candidate,
      report: reportData,
      githubMetrics,
      certificateData
    });

    let highlightedResume = resumeData.rawText || "No resume data available.";
    const falselyClaimedSkills = aiReport.resumeVerificationDashboard?.falselyClaimedSkills || [];
    
    // Highlight falsely claimed skills
    falselyClaimedSkills.forEach((skill: string) => {
      if (skill && skill.trim() !== '') {
        const escapedSkill = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(?<!\\w)(${escapedSkill})(?!\\w)`, 'gi');
        highlightedResume = highlightedResume.replace(regex, `<span style="color: #9B1C1C; font-weight: 600; background: #FDE8E8; padding: 0 4px; border-radius: 4px;">$1 <span class="badge badge-red" style="font-size: 7pt;">⚠ Unverified Skill</span></span>`);
      }
    });

    // The resume text should be left as raw string to preserve its exact original formatting via CSS white-space: pre-wrap

    const data = {
      jobId: job.id,
      timestamp: new Date().toLocaleString(),
      candidateName,
      candidateEmail,
      githubUrl,
      githubUsername,
      trustScore: reportData.trustScore || 0,
      
      aiReport,
      highlightedResume
    };

    const html = template(data);

    const browser = await puppeteer.launch({ 
      headless: true,
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    await page.setContent(html, { waitUntil: 'load' });
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' }
    });
    
    await browser.close();
    
    return Buffer.from(pdfBuffer);
  }

  public async generateBatchSummary(summaryData: any): Promise<Buffer> {
    const templatePath = path.join(__dirname, '../../templates/batch-summary.hbs');
    const templateContent = await fs.readFile(templatePath, 'utf-8');
    const template = handlebars.compile(templateContent);
    const html = template(summaryData);

    const launchOptions: any = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    };

    try {
      await fs.access('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
      launchOptions.executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    } catch {
      // Fallback to bundled Puppeteer Chromium
    }

    const browser = await puppeteer.launch(launchOptions);
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '0', bottom: '0', left: '0', right: '0' },
      });
      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }
}
