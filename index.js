const fs = require('fs');

class StepKeys {
  constructor() {
    this.data = {};
  }

  normalize(currentString, newString) {
    let normalized = newString;

    // normalize text between quotes
    normalized = normalized.replace(/"[^"]*"/g, '???');
    // normalize any number
    normalized = normalized.replace(/\d+/g, '#');

    // We use the most descriptive:
    if (normalized.length < currentString.length) {
      console.log('difference after normalization:');
      console.log(normalized);
      console.log(currentString);
      return currentString;
    } else {
      return normalized;
    }
  }

  update(key, string) {
    this.data[key] = this.data[key] || { count: 0, raws: [] };
    this.data[key].raws.push(string);
    this.data[key].count++;
    this.data[key].normalized = this.normalize(this.data[key].normalized || '', string);
  }
}

class RelationshipData {
  constructor() {
    this.entries = [];
    this.stepKeys = new StepKeys();
  }

  add(fromKey, fromText, toKey, toText) {
    this.stepKeys.update(fromKey, fromText);
    this.stepKeys.update(toKey, toText);

    let entry = this.entries.find(entry => {
      return entry.from === fromKey && entry.to === toKey;
    });
    if (entry) {
      entry.count++;
    } else {
      this.entries.push({from: fromKey, to: toKey, count: 1});
    }
  }

  static fromJson(json) {
    var data = new RelationshipData();

    // Find Features
    for (let i = 0; i < json.length; i++) {
      const feature = json[i];
      if (!feature.elements)
        continue;
      // Find Scenarios
      for (let j = 0; j < feature.elements.length; j++) {
        const scenario = feature.elements[j];
        if (!scenario.steps && !scenario.steps.length)
          continue;
        // Find Steps
        for (let k = 1; k < scenario.steps.length; k++) {
          const prevStep = scenario.steps[k-1];
          const step = scenario.steps[k];
          if(!step.name || !prevStep.name)
            continue; // its a hook!
          if(!step.match || !prevStep.match)
            continue; // its undefined
          data.add( prevStep.match.location, prevStep.name, step.match.location, step.name);
        }
      }
    }
    return data;
  }
}

class CucumberVisualizer {
  constructor(inputFile) {
    this.path = inputFile;
  }

  readJson() {
    return JSON.parse(fs.readFileSync(this.path));
  }

  generatePage(outputfile) {
    let data = RelationshipData.fromJson(this.readJson());
    const htmlPrefix = `
      <!DOCTYPE html>
      <meta charset="utf-8">
      <style>

      .links line {
        stroke: #999;
        stroke-opacity: 0.6;
      }

      .nodes circle {
        stroke: #fff;
        stroke-width: 1.5px;
      }

      text {
        font-family: sans-serif;
        font-size: 10px;
      }

      </style>
      <svg width="960" height="600"></svg>
      <script src="https://d3js.org/d3.v4.min.js"></script>
      <script>

      var svg = d3.select("svg"),
          width = +svg.attr("width"),
          height = +svg.attr("height");

      var color = d3.scaleOrdinal(d3.schemeCategory20);

      var simulation = d3.forceSimulation()
          .force("link", d3.forceLink().id(function(d) { return d.id; }).distance(100).strength(0.8))
          .force("charge", d3.forceManyBody())
          .force("center", d3.forceCenter(width / 2, height / 2));

      var graph = `;
    const htmlPostfix = `;
      var link = svg.append("g")
          .attr("class", "links")
        .selectAll("line")
        .data(graph.links)
        .enter().append("line")
          .attr("stroke-width", function(d) { return d.value; });

      var node = svg.append("g")
          .attr("class", "nodes")
        .selectAll("g")
        .data(graph.nodes)
        .enter().append("g")

      var circles = node.append("circle")
          .attr("r", function(d) { return d.size; })
          .attr("fill", "lightgreen")
          .call(d3.drag()
              .on("start", dragstarted)
              .on("drag", dragged)
              .on("end", dragended));

      var labels = node.append("text")
          .text(function(d) {
            return d.label;
          })
          .attr("text-anchor", "middle")
          .attr('x', 0)
          .attr('dy', -5)
          .style("font-size", "0.3em");

      node.append("title")
          .text(function(d) { return d.id; });

      simulation
          .nodes(graph.nodes)
          .on("tick", ticked);

      simulation.force("link")
          .links(graph.links);

      function ticked() {
        link
            .attr("x1", function(d) { return d.source.x; })
            .attr("y1", function(d) { return d.source.y; })
            .attr("x2", function(d) { return d.target.x; })
            .attr("y2", function(d) { return d.target.y; });

        node
            .attr("transform", function(d) {
              return "translate(" + d.x + "," + d.y + ")";
            })
      }

      function dragstarted(d) {
        if (!d3.event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      }

      function dragged(d) {
        d.fx = d3.event.x;
        d.fy = d3.event.y;
      }

      function dragended(d) {
        if (!d3.event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      }

      </script>`;

    let d3data = {nodes: [], links: []};

    var keys = data.stepKeys.data;
    for (const key in keys) {
      if (data.stepKeys.data.hasOwnProperty(key)) {
        d3data.nodes.push({id: key, label: keys[key].normalized, size: keys[key].count});
      }
    }

    for(var i = 0; i < data.entries.length; i++) {
      const entry = data.entries[i];
      d3data.links.push({source: entry.from, target: entry.to, value: entry.count});
    }

    console.log('Step data:');
    console.log(JSON.stringify(data.stepKeys.data));
    console.log('Relationship data:');
    console.log(JSON.stringify(data.entries));
    console.log('D3 data:');
    console.log(JSON.stringify(d3data));

    fs.writeFileSync(outputfile, `${htmlPrefix}${JSON.stringify(d3data)}${htmlPostfix}`);
  }
}

const path = require('path');
const inputfile = path.resolve('data', 'cucumber.json');
const outputfile = path.resolve('output.html');
new CucumberVisualizer(inputfile).generatePage(outputfile);

console.log(`DONE, view ${outputfile}`);