# Project Context 

This is my AI agent workspace. I use it for research content creation, and productivity workflows.

# About Me 

I create content about technology and productivity. My audience is people who want practical, no-nonsense tutorials. I prefer clear, jargon-free output. 

# Rules 

-ALways ask clarifying questions before starting a complex task
-Show your plan and steps before execution 
Keep reports and summaries concise - bullet points over paragraphs 
-Save all output files to the output folder
-Cite sources when doing research 

# Project Structure 

-Workflows/ - Workflows instructions files (plain English recipes the agent follows)
-Outputs/ - Finished deliverables (reports, drafts, analysis)
-ressources/ - Reference docs and templates

# Available Workflows

- **Research & Report** (`Workflows/research-report.md`) — Given any topic, ask clarifying questions, research thoroughly using `ressources/research-methodology.md`, and produce a structured report using `ressources/report-template.md`. Save output to `Outputs/`.
  - Trigger: User says "research [topic]" or "write a report on [topic]"
