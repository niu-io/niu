import { requestJson, type GatewayClient } from "./gateway.js";
const definition = {
  "type": "object",
  "properties": {
    "slug": {
      "type": "string",
      "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
      "maxLength": 80
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "task": {
      "type": "string",
      "minLength": 1,
      "maxLength": 4000
    },
    "rubric": {
      "type": "string",
      "minLength": 1,
      "maxLength": 8000
    },
    "protocol": {
      "type": "string",
      "enum": [
        "chat",
        "responses",
        "messages",
        "embeddings",
        "generate_content"
      ]
    },
    "revision": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740990
    },
    "samples": {
      "type": "array",
      "minItems": 1,
      "maxItems": 64,
      "items": {
        "type": "object",
        "properties": {
          "reference": {
            "type": "string",
            "minLength": 1,
            "maxLength": 100,
            "pattern": "^[A-Za-z0-9_.-]+$"
          },
          "request_sha256": {
            "type": "string",
            "pattern": "^[0-9a-f]{64}$"
          }
        },
        "required": [
          "reference",
          "request_sha256"
        ],
        "additionalProperties": false
      }
    }
  },
  "required": [
    "slug",
    "name",
    "task",
    "rubric",
    "protocol",
    "revision",
    "samples"
  ],
  "additionalProperties": false
} as const;
const submission = {
  "type": "object",
  "properties": {
    "slug": {
      "type": "string",
      "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
      "maxLength": 80
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "evaluation_revision": {
      "type": "integer",
      "minimum": 1,
      "maximum": 9007199254740991
    },
    "evaluator": {
      "type": "object",
      "properties": {
        "kind": {
          "type": "string",
          "enum": [
            "agent",
            "check"
          ]
        },
        "name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        },
        "version": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        }
      },
      "required": [
        "kind",
        "name",
        "version"
      ],
      "additionalProperties": false
    },
    "results": {
      "type": "array",
      "minItems": 1,
      "maxItems": 64,
      "items": {
        "type": "object",
        "properties": {
          "sample": {
            "type": "string",
            "minLength": 1,
            "maxLength": 100
          },
          "attempt_id": {
            "type": "string",
            "format": "uuid"
          },
          "verdict": {
            "type": "string",
            "enum": [
              "accepted",
              "rejected",
              "unknown"
            ]
          },
          "reason": {
            "type": [
              "string",
              "null"
            ],
            "maxLength": 2000
          }
        },
        "required": [
          "sample",
          "attempt_id",
          "verdict"
        ],
        "additionalProperties": false
      }
    }
  },
  "required": [
    "slug",
    "name",
    "evaluation_revision",
    "evaluator",
    "results"
  ],
  "additionalProperties": false
} as const;
const slug = { type: "string", pattern: "^[a-z0-9]+(-[a-z0-9]+)*$", maxLength: 80 };
const revision = { type: "integer", minimum: 1, maximum: 9007199254740991 };
const object = (properties: Record<string, unknown>, required: string[] = []) => ({type:"object",properties,required,additionalProperties:false});
const read = {readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false};
export const evaluationToolDefinitions = [
 {name:"list_evaluations",description:"List workspace task/rubric definitions under evaluations:read. Follow next_after. No inference.",inputSchema:object({after:slug}),annotations:read},
 {name:"get_evaluation",description:"Read current or pinned definition under evaluations:read.",inputSchema:object({slug,revision},["slug"]),annotations:read},
 {name:"set_evaluation",description:"Save task/rubric and sample request hashes under evaluations:write. Revision zero creates; otherwise supply current revision. No inference. Read back after uncertain responses; do not blindly replay.",inputSchema:object({configuration:definition},["configuration"]),annotations:{...read,readOnlyHint:false,destructiveHint:true,idempotentHint:false}},
 {name:"fingerprint_evaluation_request",description:"Compute protocol-bound version 1 input hash under evaluations:read without inference or saving raw input. Excludes top-level model/stream/stream_options/metadata/user only. Use the same effective body for tagged inference.",inputSchema:object({protocol:definition.properties.protocol,request:{type:"object"}},["protocol","request"]),annotations:read},
 {name:"list_evaluation_attempts",description:"Discover admitted requests under evaluations:read after uncertain inference responses. Query pinned revision and sample; follow next_after. Snapshot order is lexical, so restart pagination to discover new work. Absence does not prove no execution; never automatically replay paid inference.",inputSchema:object({slug,revision,sample:{type:"string",minLength:1,maxLength:100,pattern:"^[A-Za-z0-9_.-]+$"},after:{type:"string",format:"uuid"}},["slug","revision","sample"]),annotations:read},
 {name:"list_evaluation_runs",description:"List immutable attributed run receipts under evaluations:read. Follow next_after.",inputSchema:object({slug,after:slug},["slug"]),annotations:read},
 {name:"record_evaluation_run",description:"Record agent/check judgments with evaluator version under evaluations:write. Includes all operation-attempt customer charges and explicit unknown coverage. No inference. Same run slug plus identical submission replays the original receipt; different input conflicts. Judgments remain submitter-reported.",inputSchema:object({slug,submission},["slug","submission"]),annotations:{...read,readOnlyHint:false}},
 {name:"get_evaluation_run",description:"Read immutable evidence under evaluations:read. Customer charges only; unknown and owner-funded costs do not imply zero.",inputSchema:object({slug,run:slug},["slug","run"]),annotations:read},
 {name:"compare_evaluation_runs",description:"Compare verified matched samples under evaluations:read. Requires matching task/protocol/rubric; reports evaluator changes and shared operations. No universal winner or optimal-value claim.",inputSchema:object({slug,left:slug,right:slug},["slug","left","right"]),annotations:read},
] as const;
function reference(value:unknown):string {
 if(typeof value!=="string" || value.length>80 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(value)) throw new Error("Use a readable evaluation/run slug");return value;
}
export async function callEvaluationTool(client:GatewayClient,name:string,raw:unknown):Promise<unknown>{
 if(!raw || typeof raw!=="object" || Array.isArray(raw)) throw new Error("Evaluation arguments must be an object");
 if(JSON.stringify(raw).length>65536) throw new Error("Evaluation arguments exceed 64 KiB");
 const input=raw as Record<string,unknown>;
 const tool=evaluationToolDefinitions.find(tool=>tool.name===name);
 if(!tool || Object.keys(input).some(key=>!Object.keys(tool.inputSchema.properties).includes(key))) throw new Error("Unexpected evaluation tool or argument");
 let path="/evaluations";let method:"GET"|"POST"|"PUT"="GET";let body:unknown;
 const query=new URLSearchParams();
 if(name==="fingerprint_evaluation_request"){path+="/fingerprint";method="POST";body={protocol:input.protocol,request:input.request};}
 else if(name==="set_evaluation"){
  const config=input.configuration as Record<string,unknown>|undefined;
  if(!config || !Number.isSafeInteger(config.revision) || Number(config.revision)<0) throw new Error("Use an evaluation configuration with expected revision");
  path+=`/${reference(config.slug)}`;method="PUT";body=config;
 }else{
  if(name!=="list_evaluations") path+=`/${reference(input.slug)}`;
  if(name==="list_evaluation_runs" || name==="record_evaluation_run") path+="/runs";
  if(name==="record_evaluation_run"){method="POST";body=input.submission;}
  if(name==="get_evaluation_run") path+=`/runs/${reference(input.run)}`;
  if(name==="compare_evaluation_runs"){path+="/compare";query.set("left",reference(input.left));query.set("right",reference(input.right));}
  if(name==="list_evaluation_attempts"){
   path+="/attempts";
   if(typeof input.sample!=="string" || !/^[A-Za-z0-9_.-]{1,100}$/.test(input.sample)) throw new Error("Use the definition sample reference");
   query.set("sample",input.sample);
  }
  if(input.revision!==undefined){if(!Number.isSafeInteger(input.revision)||Number(input.revision)<1)throw new Error("Use a positive definition revision");query.set("revision",String(input.revision));}
  if(name==="list_evaluation_attempts" && input.revision===undefined)throw new Error("Pin an evaluation revision");
  if(input.after!==undefined){
   if(name==="list_evaluation_attempts"){
    if(typeof input.after!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input.after))throw new Error("Use the returned attempt cursor");
    query.set("after",input.after);
   }else query.set("after",reference(input.after));
  }
 }
 if(query.size)path+="?"+query.toString();
 return (await requestJson(client,method,path,body)).data;
}
