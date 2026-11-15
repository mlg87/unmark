# Plain-language rules

These rules make technical text short, direct, and hard to misread. Apply them to every sentence you write, at the level that fits the text.

## Two levels

| Level | Apply it to | How strictly |
| --- | --- | --- |
| Strict | Steps, commands, warnings, and error text | Apply every rule in this file. |
| Standard | Explanation, such as an overview or the reasons for a design | Apply the sentence rules. Follow the word rules where they do not make the text stiff. |

A misread step or warning can break a system. A misread explanation does less harm. That is why the two levels differ.

## Sentence rules

- Write in the active voice. Name who or what does the action: "The server reads the file", not "The file is read".
- Give one instruction in a sentence.
- Keep a step to 20 words or fewer. Keep a description to 25 words or fewer.
- Use no semicolons. Write two sentences.
- Use a one-word verb in place of a two-word verb: "start", not "spin up".
- Put at most 3 nouns in a row. Rewrite a longer stack with "of" or "for", or with a verb.
- Keep the subject and the articles. Do not drop "the", "a", or "it" to save space.
- Use simple tenses: the present, the past, and the future with "will". Use "has completed" only where it says something that "completed" does not, such as a result that is still true now.
- Give a paragraph one topic and at most 6 sentences.
- Use a list for 3 or more steps or conditions.

## Word rules

- Use one name for one thing in the whole document. If you call it "the worker", do not later call it "the job runner".
- Use the verb, not the noun made from it: "analyze", not "perform an analysis".
- Define a domain term the first time you use it. Then use it without a new definition.
- Use no sales adjectives, such as "best-in-class", "intuitive", or "world-class". State what the thing does, or give the number that shows it.

## Keep the writer's certainty

The words "may", "can", and "should" carry meaning. They tell the reader how sure the writer is. A shorter sentence that removes them says something different.

- Never turn "may have failed" into "failed".
- Never turn "can cause" into "causes".
- Never add a cause, a number, a name, or a date that the source does not give.
- Never add an inference or a piece of advice that the source does not state, even one that seems to follow from a fact.

When a shorter sentence would drop a condition or a hedge, the longer sentence wins.

## Six habits to remove

1. **Several names for one thing.** A guide that says "the node", "the host", and "the machine" makes the reader ask whether there are three computers. Choose one name and keep it.
2. **Stacked hedges.** After "might possibly perhaps", the reader has no claim left to act on. Keep one hedge, or state the fact.
3. **Nouns made from verbs.** "Carry out the installation of" takes five words to say "install". Write the verb.
4. **Sales adjectives.** "Lightning-fast" and "effortless" are opinions, not facts. Delete them. If the speed matters, give the measured value from a source.
5. **Run-on sentences.** A sentence that joins three ideas with commas, dashes, and "and" makes the reader hold all three at once. Split it so that each sentence has one idea.
6. **Two-word verbs.** "Set up", "look into", and "go over" each have several meanings, and the reader must guess which one you mean. Use "create", "investigate", and "read".

## Examples

| Before | After | Rule |
| --- | --- | --- |
| The configuration file is read by the server at startup. | The server reads the configuration file when it starts. | Active voice |
| Set up the database, then bring up the API. | Create the database. Then start the API. | Two-word verbs, one instruction in a sentence |
| Perform a validation of the input file prior to the submission of the job. | Validate the input file before you submit the job. | Verbs, not nouns made from verbs |
| The cache could perhaps, in some cases, possibly return stale data. | The cache can return stale data. | Stacked hedges, with one hedge kept |
| Our best-in-class sync engine keeps every device effortlessly up to date. | The sync service copies each change to every device. | Sales adjectives |
| Restart the worker. If the job runner still hangs, check the daemon log. | Restart the worker. If the worker still stops responding, check the worker log. | One name for one thing |
| Change the production database connection pool timeout value. | Change the timeout of the connection pool for the production database. | At most 3 nouns in a row |
| The build stopped, and the deploy did not start, so the release is late, and the team is now waiting for a fix. | The build stopped. The deploy did not start. The release is late. The team is waiting for a fix. | Run-on sentence |
| The upload may have failed. | The upload may have failed. Do not change it to "The upload failed." | Keep the writer's certainty |

## When not to apply

Do not rewrite these. Copy them exactly:

- Quotes from a person or a document
- Legal text, such as a license or a contract
- User-interface strings copied from a product, such as a button label or an error message
- Code, commands, and their output
- Creative text, where the voice is the point

## Credit

The rules in this file follow the ideas of ASD-STE100, Simplified Technical English, a standard of the AeroSpace and Defence Industries Association of Europe (ASD). They also follow the `asd-ste100` skill by Dustin Yuchen Teng (<https://github.com/danyuchn/asd-ste100-skill>), released under the MIT license. This file states those ideas in new words.

This file holds no approved-word list, and it checks no text against one. The ASD-STE100 dictionary is not part of this file.
