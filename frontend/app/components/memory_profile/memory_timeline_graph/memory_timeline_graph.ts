import {AfterViewInit, Component, ElementRef, HostListener, Input, OnChanges, SimpleChanges, ViewChild} from '@angular/core';

import {MemoryProfileProtoOrNull} from 'org_xprof/frontend/app/common/interfaces/data_table';
import {MemoryProfileSnapshot} from 'org_xprof/frontend/app/common/interfaces/data_table';

const MAX_CHART_WIDTH = 1500;

/** A Memory Timeline Graph view component. */
@Component({
  selector: 'memory-timeline-graph',
  templateUrl: './memory_timeline_graph.ng.html',
  styleUrls: ['./memory_timeline_graph.scss']
})
export class MemoryTimelineGraph implements AfterViewInit, OnChanges {
  /** The memory profile data. */
  @Input() memoryProfileProtoOrNull: MemoryProfileProtoOrNull = null;

  @ViewChild('chart', {static: false}) chartRef!: ElementRef;

  title = 'Memory Timeline Graph';
  height = 450;
  width = 0;
  chart: google.visualization.AreaChart|null = null;

  ngAfterViewInit() {
    this.loadGoogleChart();
  }

  ngOnChanges(changes: SimpleChanges) {
    this.width = 0;
    this.drawChart();
  }

  @HostListener('window:resize')
  onResize() {
    this.drawChart();
  }

  drawChart() {
    if (!this.chartRef) {
      return;
    }

    const newWidth =
        Math.min(MAX_CHART_WIDTH, this.chartRef.nativeElement.offsetWidth);

    if (!this.chart || !this.memoryProfileProtoOrNull ||
        this.width === newWidth) {
      return;
    }
    this.width = newWidth;

    if (!this.memoryProfileProtoOrNull ||
        !this.memoryProfileProtoOrNull.memoryProfilePerAllocator) {
      return;
    }

    /* Shows the memory list and chart only if there is memory data*/
    const memoryId =
        Object.keys(this.memoryProfileProtoOrNull.memoryProfilePerAllocator)[0];
    const snapshots =
        this.memoryProfileProtoOrNull.memoryProfilePerAllocator[memoryId]
            .memoryProfileSnapshots;

    if (!snapshots) return;

    const dataTable = new google.visualization.DataTable();
    dataTable.addColumn('number', 'timestamp(ps)');
    dataTable.addColumn('number', 'stack');
    dataTable.addColumn('number', 'heap');
    dataTable.addColumn({type: 'string', role: 'tooltip'});
    dataTable.addColumn('number', 'free');

    for (let i = 0; i < snapshots.length; i++) {
      const stats = snapshots[i].aggregationStats;
      if (!stats || !snapshots[i].timeOffsetPs) {
        continue;
      }
      dataTable.addRow([
        this.picoToMilli(snapshots[i].timeOffsetPs),
        this.bytesToGiBs(stats.stackReservedBytes),
        this.bytesToGiBs(stats.heapAllocatedBytes),
        this.getMetadataTooltip(snapshots[i]),
        this.bytesToGiBs(stats.freeMemoryBytes),
      ]);
    }

    const options = {
      curveType: 'none',
      chartArea: {left: 50, width: '100%'},
      hAxis: {
        title: 'Timestamp (ms)',
        textStyle: {bold: true},
      },
      vAxis: {
        title: 'Memory Usage (GiBs)',
        minValue: 0,
        textStyle: {bold: true},
      },
      // tslint:disable-next-line:no-any
      legend: {position: 'top' as any},
      tooltip: {
        trigger: 'selection',
      },
      colors: ['red', 'orange', 'green'],
      height: this.height,
      isStacked: true,
      explorer: {
        actions: ['dragToZoom', 'rightClickToReset'],
        maxZoomIn: .001,
        maxZoomOut: 10,
      },
    };

    this.chart.draw(dataTable, options);
  }

  bytesToGiBs(stat: string|number|undefined) {
    if (!stat) return 0;
    return Number(stat) / 1.0 / 1024 / 1024 / 1024;
  }

  picoToMilli(timePs: string|undefined) {
    if (!timePs) return 0;
    return Number(timePs) / 1.0 / 1e9;
  }

  getMetadataTooltip(snapshot: MemoryProfileSnapshot|undefined) {
    if (!snapshot) return '';
    const timestampMs = this.picoToMilli(snapshot.timeOffsetPs);
    const stats = snapshot.aggregationStats;
    const metadata = snapshot.activityMetadata;
    if (!stats || !metadata || !metadata.requestedBytes ||
        !metadata.allocationBytes || !metadata.memoryActivity) {
      return '';
    }
    let requestedSizeGib = this.bytesToGiBs(metadata.requestedBytes);
    let allocationSizeGib = this.bytesToGiBs(metadata.allocationBytes);
    if (metadata.memoryActivity === 'DEALLOCATION') {
      requestedSizeGib = -requestedSizeGib;
      allocationSizeGib = -allocationSizeGib;
    }
    const memInUseGib = this.bytesToGiBs(
                                Number(stats.stackReservedBytes) +
                                Number(stats.heapAllocatedBytes))
                            .toFixed(4);
    let metadataTooltip = 'timestamp(ms): ' + timestampMs.toFixed(1);
    metadataTooltip += '\nevent: ' + metadata.memoryActivity.toLowerCase();
    if (Number(metadata.requestedBytes) > 0) {
      metadataTooltip +=
          '\nrequested_size(GiBs): ' + requestedSizeGib.toFixed(4);
    }
    metadataTooltip +=
        '\nallocation_size(GiBs): ' + allocationSizeGib.toFixed(4);
    if (metadata.tfOpName) {
      metadataTooltip += '\ntf_op: ' + metadata.tfOpName;
    }
    if (metadata.stepId) {
      metadataTooltip += '\nstep_id: ' + metadata.stepId;
    }
    if (metadata.regionType) {
      metadataTooltip += '\nregion_type: ' + metadata.regionType;
    }
    if (metadata.dataType && metadata.dataType !== 'INVALID') {
      metadataTooltip += '\ndata_type: ' + metadata.dataType;
    }
    if (metadata.tensorShape) {
      metadataTooltip += '\ntensor_shape: ' + metadata.tensorShape;
    }
    metadataTooltip += '\n\nmemory_in_use(GiBs): ' + memInUseGib;
    return metadataTooltip;
  }

  loadGoogleChart() {
    if (!google || !google.charts) {
      setTimeout(() => {
        this.loadGoogleChart();
      }, 100);
    }

    // tslint:disable-next-line:no-any
    (google.charts as any)['load']('current', {'packages': ['corechart']});
    google.charts.setOnLoadCallback(() => {
      this.chart =
          new google.visualization.AreaChart(this.chartRef.nativeElement);
      this.drawChart();
    });
  }
}
