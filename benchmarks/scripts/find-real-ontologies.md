# Real Ontologies for Testing

## Well-Designed Domain Ontologies

### Music Domain

1. **Music Ontology (MO)**
   - URL: http://musicontology.com/
   - GitHub: https://github.com/motools/musicontology
   - Format: OWL/RDF
   - Coverage: Artists, albums, tracks, performances, events
   - Test Data: Music reviews, artist bios, album descriptions

2. **MusicBrainz Ontology**
   - URL: https://musicbrainz.org/doc/MusicBrainz_Database/Schema
   - Coverage: Comprehensive music metadata
   - Test Data: MusicBrainz database entries

### Scientific Domain

3. **BioPortal Ontologies**
   - URL: https://bioportal.bioontology.org/
   - Coverage: Biomedical, life sciences
   - Examples: Gene Ontology, Disease Ontology, Chemical Entities
   - Test Data: Scientific abstracts, papers

4. **Schema.org**
   - URL: https://schema.org/
   - Coverage: General web content (articles, events, products, etc.)
   - Test Data: Web pages, product descriptions

### Social Domain

5. **FOAF (Friend of a Friend)**
   - URL: http://xmlns.com/foaf/spec/
   - Coverage: People, relationships, organizations
   - Test Data: Social media profiles, contact lists
   - **We already have**: `packages/core/test/fixtures/ontologies/foaf-minimal.ttl`

6. **SIOC (Semantically-Interlinked Online Communities)**
   - URL: https://www.w3.org/Submission/sioc-spec/
   - Coverage: Online communities, forums, blogs
   - Test Data: Forum posts, blog entries

### Location/Geographic

7. **GeoSPARQL**
   - URL: https://www.ogc.org/standards/geosparql
   - Coverage: Geographic features, spatial relationships
   - Test Data: Location descriptions, geographic texts

### General Purpose

8. **Dublin Core**
   - URL: https://www.dublincore.org/specifications/dublin-core/dcmi-terms/
   - Coverage: Metadata for resources
   - Test Data: Document metadata, bibliographic records

## Recommended Starting Points

1. **FOAF** - We already have it, well-designed, good for testing
2. **Music Ontology** - Clear domain, good test data available
3. **Schema.org** - Broad coverage, lots of test data

