import { Component, OnInit, Input, ViewChild, TemplateRef, Output, EventEmitter } from '@angular/core';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { AgGridAngular } from 'ag-grid-angular';
import { GridOptions, GridReadyEvent, RowNode } from 'ag-grid-community';

import { CommonService } from 'src/app/utils/services/common.service';
import { AppService } from 'src/app/utils/services/app.service';
import { AgGridSharedFloatingFilterComponent } from 'src/app/utils/ag-grid-shared-floating-filter/ag-grid-shared-floating-filter.component';
import { AgGridActionsRendererComponent } from 'src/app/utils/ag-grid-actions-renderer/ag-grid-actions-renderer.component';
import { LocalBotCellRendererComponent } from '../local-bot-cell-renderer/local-bot-cell-renderer.component';

@Component({
  selector: 'odp-manage-bot-key',
  templateUrl: './manage-bot-key.component.html',
  styleUrls: ['./manage-bot-key.component.scss']
})
export class ManageBotKeyComponent implements OnInit {
  @ViewChild('newKeyModal', { static: false }) newKeyModal: TemplateRef<HTMLElement>;
  @ViewChild('agGrid') agGrid: AgGridAngular;
  @Input() selectedBot: any;
  @Output() dataChange: EventEmitter<any>;
  openDeleteBotKeyModal: EventEmitter<any>;
  editKeyModalRef: NgbModalRef
  showLazyLoader: boolean;
  keyForm: FormGroup
  gridOptions: GridOptions;
  frameworkComponents: any;
  filterModel: any;
  filtering: boolean;

  constructor(
    private fb: FormBuilder,
    public commonService: CommonService,
    private appService: AppService,
    private ts: ToastrService
  ) {
    const self = this;
    self.dataChange = new EventEmitter();
    self.keyForm = self.fb.group({
      label: [null, [Validators.required, Validators.maxLength(30), Validators.pattern('[a-zA-Z0-9\\s-_]+')]],
      expires: [null, [Validators.required, Validators.min(1)]]
    });
    self.openDeleteBotKeyModal = new EventEmitter();
  }

  ngOnInit() {
    this.setupGrid();
  }

  setupGrid() {
    this.frameworkComponents = {
      customCellRenderer: LocalBotCellRendererComponent,
      actionCellRenderer: AgGridActionsRendererComponent
    };
    this.gridOptions = {
      defaultColDef: {
        cellRenderer: 'customCellRenderer',
        headerClass: 'hide-filter-icon',
        resizable: true,
        sortable: true,
        filter: 'agTextColumnFilter',
        suppressMenu: true,
        floatingFilter: true,
        floatingFilterComponentFramework: AgGridSharedFloatingFilterComponent,
        filterParams: {
          caseSensitive: true,
          suppressAndOrCondition: true,
          suppressFilterButton: true
        }
      },
      columnDefs: [
        {
          headerName: 'Key',
          field: 'label',
          refData: {
            filterType: 'text',
            namespace: 'keys'
          }
        },
        {
          headerName: 'Expiry',
          field: 'createdAt',
          minWidth: 270,
          refData: {
            filterType: 'date-time',
            timezone: 'Zulu',
            namespace: 'keys'
          }
        },
        {
          headerName: 'Value',
          field: 'keyValue',
          minWidth: 270,
          sortable: false,
          filter: false,
          refData: {
            namespace: 'keys'
          }
        },
        ...(this.hasPermission('PMBBU') || this.hasPermission('PMBA')
          ? [
            {
              headerName: 'Actions',
              pinned: 'right',
              cellRenderer: 'actionCellRenderer',
              sortable: false,
              filter: false,
              minWidth: (this.hasPermission('PMBBU') ? 94 : 0) + (this.hasPermission('PMBA') ? 164 : 0),
              maxWidth: (this.hasPermission('PMBBU') ? 94 : 0) + (this.hasPermission('PMBA') ? 164 : 0),
              refData: {
                actionButtonsMapperFn: 'actionButtonsMapperFn',
                actionCallbackFunction: 'onGridAction'
              }
            }
          ]
          : [])
      ],
      context: this,
      animateRows: true,
      onGridReady: this.onGridReady.bind(this),
      onRowDataChanged: this.autoSizeAllColumns.bind(this),
      onGridSizeChanged: this.forceResizeColumns.bind(this),
    };
  }

  private onGridReady(event: GridReadyEvent) {
    this.forceResizeColumns();
  }

  private forceResizeColumns() {
    this.agGrid.api.sizeColumnsToFit();
    this.autoSizeAllColumns();
  }

  private autoSizeAllColumns() {
    const fixedSize = (this.hasPermission('PMBBU') ? 94 : 0) + (this.hasPermission('PMBA') ? 164 : 0);
    if (!!this.agGrid.api && !!this.agGrid.columnApi) {
      setTimeout(() => {
        const container = document.querySelector('.grid-container');
        const availableWidth = !!container ? container.clientWidth - fixedSize : 730;
        const allColumns = this.agGrid.columnApi.getAllColumns();
        allColumns.forEach(col => {
          this.agGrid.columnApi.autoSizeColumn(col);
          if (col.getActualWidth() > 200 || this.agGrid.api.getDisplayedRowCount() === 0) {
            col.setActualWidth(200);
          }
        });
        const occupiedWidth = allColumns.reduce((pv, cv) => pv + cv.getActualWidth(), -fixedSize);
        if (occupiedWidth < availableWidth) {
          this.agGrid.api.sizeColumnsToFit();
        }
      }, 2000);
    }
  }

  actionButtonsMapperFn(data: any) {
    const buttons = [];
    if (this.hasPermission('PMBBU')) {
      buttons.push('Edit');
      buttons.push('Delete');
    }
    if (this.hasPermission('PMBA')) {
      buttons.push('End Session');
      buttons.push(data.isActive ? 'Deactivate' : 'Activate')
    }
    return buttons;
  }

  onGridAction(buttonName: string, rowNode: RowNode) {
    switch (buttonName) {
      case 'Edit':
        {
          this.editBotKey(rowNode.data);
        }
        break;
      case 'End Session':
        {
          this.endSession(rowNode.data);
        }
        break;
      case 'Delete':
        {
          this.deleteBotKey(rowNode.data);
        }
        break;
      case 'Activate':
      case 'Deactivate':
        {
          this.deactivateKey(rowNode.data);
        }
        break;
    }
  }

  onFilterChanged(event) {
    this.filtering = true;
    this.filterModel = this.agGrid?.api?.getFilterModel();
    setTimeout(() => {
      this.filtering = false;
    }, 1000);
  }

  editBotKey(key: any) {
    const self = this;
    self.keyForm.get('label').patchValue(key.label)
    self.keyForm.get('expires').patchValue(key.expires / 1440)
    self.editKeyModalRef = self.commonService.modal(self.newKeyModal, { size: 'sm' });
    self.editKeyModalRef.result.then(close => {
      if (close) {
        const payload = self.keyForm.value;
        payload.expires = payload.expires * 1440;
        payload.keyId = key._id;
        self.showLazyLoader = true;

        self.commonService.put('user', `/bot/botKey/${self.selectedBot._id}?app=${this.commonService.app._id}`, payload)
          .subscribe((res) => {
            self.showLazyLoader = false;
            self.selectedBot = res;
            self.dataChange.emit(res);
          }, err => {
            self.commonService.errorToast(err, 'Oops, something went wrong. Please try again later.');
          });
      } else {
        self.showLazyLoader = false;
        self.keyForm.reset();
      }
    }, dismiss => {
      self.keyForm.reset();
    });
  }

  getDate(key) {
    if (key.createdAt) {
      const time = new Date(key.createdAt).getTime();
      return new Date(time + key.expires * 60000);
    }
    else {
      return '-';
    }
  }

  copyKey(key) {
    const self = this;
    self.appService.copyToClipboard(key.keyValue);
    self.ts.success('Key copied successfully');
  }

  endSession(key: any) {
    const self = this;
    const payload = { keyId: key._id }
    self.showLazyLoader = true;

    self.commonService.delete('user', `/bot/botKey/session/${self.selectedBot._id}?app=${this.commonService.app._id}`, payload)
      .subscribe((res) => {
        self.showLazyLoader = false;
        self.ts.success("Session ended");
      }, err => {
        self.showLazyLoader = false;
        self.commonService.errorToast(err, 'Oops, something went wrong. Please try again later.');
      });
  }

  deactivateKey(key) {
    const self = this;
    const payload = key
    payload.isActive = !key.isActive;
    payload.keyId = key._id;
    self.showLazyLoader = true;

    self.commonService.put('user', `/bot/botKey/${self.selectedBot._id}?app=${this.commonService.app._id}`, payload)
      .subscribe((res) => {
        self.showLazyLoader = false;
        self.selectedBot = res;
        self.dataChange.emit(res);
      }, err => {
        self.showLazyLoader = false;
        self.commonService.errorToast(err, 'Oops, something went wrong. Please try again later.');
      });
  }


  deleteBotKey(key) {
    const self = this;
    const alertModal: any = {};
    alertModal.statusChange = false;
    alertModal.title = 'Delete Bot Key';
    alertModal.message = 'Are you sure you want to delete the bot key?';
    alertModal._id = key._id
    self.openDeleteBotKeyModal.emit(alertModal);
  }


  closeDeleteBotKeyModal(data) {
    if (data) {
      const self = this;
      const payload = { keyId: data._id }
      self.showLazyLoader = true;

      self.commonService.delete('user', `/bot/botKey/${self.selectedBot._id}?app=${this.commonService.app._id}`, payload)
        .subscribe((res) => {
          self.showLazyLoader = false;
          self.selectedBot = res;
          self.dataChange.emit(res);
        }, err => {
          self.showLazyLoader = false;
          self.commonService.errorToast(err, 'Oops, something went wrong. Please try again later.');
        });
    }
  }
  hasPermission(type: string): boolean {
    const self = this;
    return self.commonService.hasPermission(type);
  }
}
