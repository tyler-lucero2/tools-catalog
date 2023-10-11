import { execa } from 'execa';
import { sep } from 'node:path';
import { readFile, access } from 'fs/promises';
import { tmpdir } from 'node:os';
import { mkdtemp, writeFile } from 'node:fs/promises';
import OpenAI from "openai";

const checkFileExists = async filePath => {
    try {
      await access(filePath);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

// private key for openai
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// in the future, will change to hpe-cds
const orgName = "microsoft";
const https = 'https://';

// get all repos in org
const { stdout } = await execa('gh', ['repo', 'list', orgName, '--json', 'name', '--limit', '2']);
const repos = JSON.parse(stdout);
let readmeEntries = '';

for (const repo of repos) {
    const repoName = repo['name'];
    let repoUrl = `https://github.com/${orgName}/${repoName}`

    // using token to clone
    const token = process.env.I18N_GITHUB_TOKEN;
    const repoUrlWithToken = `${repoUrl.slice(0, https.length) + token}@${repoUrl.slice(
        https.length,
        repoUrl.length,
    )}`;
    const tmpDir = tmpdir();
    let cloneDir = '';
    cloneDir = await mkdtemp(`${tmpDir}${sep}`);
    await execa('git', ['clone', repoUrlWithToken, cloneDir]);

    // assume there is a README at root level
    const readmeLocation = `${cloneDir}/README.md`
    if(await checkFileExists(readmeLocation)){
        const readme = await readFile(readmeLocation, 'utf8');
        const generatedSummary = await openai.chat.completions.create({
            messages: [{ role: "user", content: `Create a one paragraph summary of this repository from this README:\n${readme}` }],
            model: "gpt-3.5-turbo",
        });
        const readmeEntry = `[${repoName}](${repoUrl})\n\n${generatedSummary.choices[0].message.content}\n\n`
        readmeEntries += readmeEntry;
    }
};
// hacky way to remove extra newline
readmeEntries = readmeEntries.slice(0, -1);
await writeFile(`${orgName.toUpperCase()}.md`, readmeEntries);