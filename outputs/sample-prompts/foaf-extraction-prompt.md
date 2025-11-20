# Knowledge Extraction Task

You are extracting structured knowledge from text using the **FOAF** ontology.

## Ontology Statistics
- Classes: 11
- Properties: 11

## Task
Extract entities and relationships from the provided text.

## Output Format
Your response must be valid JSON matching this schema:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$defs": {
    "KnowledgeGraph": {
      "type": "object",
      "required": [
        "entities"
      ],
      "properties": {
        "entities": {
          "type": "array",
          "items": {
            "type": "object",
            "required": [
              "@id",
              "@type",
              "properties"
            ],
            "properties": {
              "@id": {
                "type": "string"
              },
              "@type": {
                "type": "string",
                "enum": [
                  "http://xmlns.com/foaf/0.1/Image",
                  "http://xmlns.com/foaf/0.1/OnlineGamingAccount",
                  "http://xmlns.com/foaf/0.1/OnlineAccount",
                  "http://xmlns.com/foaf/0.1/Document",
                  "http://xmlns.com/foaf/0.1/OnlineChatAccount",
                  "http://xmlns.com/foaf/0.1/OnlineEcommerceAccount",
                  "http://xmlns.com/foaf/0.1/Person",
                  "http://xmlns.com/foaf/0.1/Project",
                  "http://xmlns.com/foaf/0.1/Organization",
                  "http://xmlns.com/foaf/0.1/Agent",
                  "http://xmlns.com/foaf/0.1/Group"
                ]
              },
              "properties": {
                "type": "array",
                "items": {
                  "type": "object",
                  "required": [
                    "predicate",
                    "object"
                  ],
                  "properties": {
                    "predicate": {
                      "type": "string",
                      "enum": [
                        "http://xmlns.com/foaf/0.1/knows",
                        "http://xmlns.com/foaf/0.1/currentProject",
                        "http://xmlns.com/foaf/0.1/pastProject",
                        "http://xmlns.com/foaf/0.1/title",
                        "http://xmlns.com/foaf/0.1/mbox",
                        "http://xmlns.com/foaf/0.1/homepage",
                        "http://xmlns.com/foaf/0.1/depiction",
                        "http://xmlns.com/foaf/0.1/account",
                        "http://xmlns.com/foaf/0.1/name",
                        "http://xmlns.com/foaf/0.1/age",
                        "http://xmlns.com/foaf/0.1/member"
                      ]
                    },
                    "object": {
                      "anyOf": [
                        {
                          "type": "string"
                        },
                        {
                          "type": "object",
                          "required": [
                            "@id"
                          ],
                          "properties": {
                            "@id": {
                              "type": "string"
                            }
                          },
                          "additionalProperties": false
                        }
                      ]
                    }
                  },
                  "additionalProperties": false
                }
              }
            },
            "additionalProperties": false
          }
        }
      },
      "additionalProperties": false,
      "description": "A collection of entities extracted from text, validated against an ontology",
      "title": "Knowledge Graph Extraction"
    }
  },
  "$ref": "#/$defs/KnowledgeGraph"
}
```

## Text to Analyze
Alice is a software engineer who knows Bob and Carol.
Bob works at Acme Corporation as a senior developer.
Alice created a research document titled "Semantic Web Best Practices" which was published in 2024.
Carol is a project manager at Tech Innovations Inc.
Bob and Carol both graduated from MIT.
Alice maintains a personal homepage at https://alice.example.com.

## Instructions
1. Identify all entities mentioned in the text
2. Extract their properties and relationships
3. Return as a knowledge graph following the schema above
4. Use exact IRIs from the enum values
5. Ensure all required fields are present

Please provide your extraction as valid JSON.