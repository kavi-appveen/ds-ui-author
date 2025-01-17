import { Component, OnInit, OnDestroy, ViewChild, TemplateRef, EventEmitter, } from '@angular/core';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { ToastrService } from 'ngx-toastr';
import { AgGridAngular, AgGridColumn } from 'ag-grid-angular';
import { GridReadyEvent, IDatasource, IGetRowsParams } from 'ag-grid-community';
import { switchMap } from 'rxjs/operators';
import { of } from 'rxjs';
import * as _ from 'lodash';

import { GetOptions, CommonService } from 'src/app/utils/services/common.service';
import { AppService } from 'src/app/utils/services/app.service';
import { FaasFilterComponent } from './faas-filter/faas-filter.component';
import { FaasCellComponent } from './faas-cell/faas-cell.component';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'odp-faas-listing',
  templateUrl: './faas-listing.component.html',
  styleUrls: ['./faas-listing.component.scss']
})
export class FaasListingComponent implements OnInit, OnDestroy {

  @ViewChild('agGrid') agGrid: AgGridAngular;
  @ViewChild('newFaasModal', { static: false }) newFaasModal: TemplateRef<HTMLElement>;
  form: FormGroup;
  apiConfig: GetOptions;
  subscriptions: any;
  newFaasModalRef: NgbModalRef;
  columnDefs: Array<AgGridColumn>;
  dataSource: IDatasource;
  sortModel: any;
  filterModel: any;
  totalCount: number;
  loadedCount: number;
  noRowsTemplate: string;
  constructor(public commonService: CommonService,
    private appService: AppService,
    private router: Router,
    private ts: ToastrService,
    private fb: FormBuilder) {
    this.subscriptions = {};
    this.form = this.fb.group({
      name: [null, [Validators.required, Validators.maxLength(40), Validators.pattern(/\w+/)]],
      description: [null, [Validators.maxLength(240), Validators.pattern(/\w+/)]],
      api: [null]
    });
    this.apiConfig = {
      page: 1,
      count: 30
    };
    this.noRowsTemplate = '<span>No records to display</span>';
  }
  ngOnInit() {
    this.configureColumns();
    this.dataSource = {
      getRows: (params: IGetRowsParams) => {
        this.agGrid.api.showLoadingOverlay();
        this.apiConfig.page = Math.ceil((params.endRow / 30));
        if (this.apiConfig.page === 1) {
          this.loadedCount = 0;
        }
        if (!this.apiConfig.filter) {
          this.apiConfig.filter = {};
        }
        this.apiConfig.sort = this.appService.getSortFromModel(this.agGrid.api.getSortModel());
        if (!!this.subscriptions['data_' + this.apiConfig.page]) {
          this.subscriptions['data_' + this.apiConfig.page].unsubscribe();
        }
        this.subscriptions['data_' + this.apiConfig.page] = this.getFaasCount()
          .pipe(
            switchMap(count => {
              this.totalCount = count;
              if (this.totalCount > 0) {
                return this.getFaas();
              } else {
                this.agGrid.api.hideOverlay();
                this.agGrid.api.showNoRowsOverlay();
                return of(null);
              }
            })
          ).subscribe(
            docs => {
              if (!!docs) {
                this.loadedCount += docs.length;
                this.agGrid.api.hideOverlay();
                if (this.loadedCount < this.totalCount) {
                  params.successCallback(docs);
                } else {
                  this.totalCount = this.loadedCount;
                  params.successCallback(docs, this.totalCount);
                }
              } else {
                params.successCallback([], 0);
              }
            },
            err => {
              this.agGrid.api.hideOverlay();
              console.error(err);
              params.failCallback();
            }
          );
      }
    };
    this.commonService.apiCalls.componentLoading = false;
    this.form.get('api').disable();
    this.form.get('name').valueChanges.subscribe(val => {
      this.form.get('api').patchValue(`/api/a/faas/${this.commonService.app._id}/${_.camelCase(val)}`);
    });
    this.subscriptions.appChange = this.commonService.appChange.subscribe(app => {
      this.agGrid.api.purgeInfiniteCache();
    });
    this.subscriptions['faas.delete'] = this.commonService.faas.delete.subscribe(data => {
      this.agGrid.api.purgeInfiniteCache();
    });
    this.subscriptions['faas.status'] = this.commonService.faas.status.subscribe(data => {
      this.agGrid.api.purgeInfiniteCache();
    });
    this.subscriptions['faas.new'] = this.commonService.faas.new.subscribe(data => {
      this.agGrid.api.purgeInfiniteCache();
    });
  }

  ngOnDestroy() {
    Object.keys(this.subscriptions).forEach(e => {
      this.subscriptions[e].unsubscribe();
    });
    if (this.newFaasModalRef) {
      this.newFaasModalRef.close();
    }
  }

  configureColumns() {
    const columns = [];
    let col = new AgGridColumn();
    col.headerName = 'Name';
    col.field = 'name';
    col.pinned = 'left';
    col.lockPinned = true;
    col.width = 180;
    col.sort = 'asc';
    columns.push(col);
    col = new AgGridColumn();
    col.headerName = 'URL';
    col.field = 'url';
    columns.push(col);
    col = new AgGridColumn();
    col.headerName = 'Description';
    col.field = 'description';
    columns.push(col);
    col = new AgGridColumn();
    col.headerName = 'Status';
    col.field = 'status';
    col.width = 100;
    columns.push(col);
    col = new AgGridColumn();
    col.headerName = 'Last Invoked';
    col.field = 'lastInvoked';
    col.width = 180;
    columns.push(col);
    col = new AgGridColumn();
    col.headerName = 'Options';
    col.field = '_options';
    col.pinned = 'right';
    col.lockPinned = true;
    columns.push(col);
    columns.forEach((item: AgGridColumn) => {
      item.suppressMovable = true;
      item.resizable = true;
      item.suppressMenu = true;
      if (item.field !== '_options') {
        item.sortable = true;
        item.filter = 'agTextColumnFilter';
        item.floatingFilterComponentFramework = FaasFilterComponent;
      }
      item.cellRendererFramework = FaasCellComponent;
    });
    this.columnDefs = columns;
  }

  newFaas() {
    this.newFaasModalRef = this.commonService.modal(this.newFaasModal, { size: 'sm' });
    this.newFaasModalRef.result.then(close => {
      if (close && this.form.valid) {
        this.triggerFaasCreate();
      }
    }, dismiss => {
      this.form.reset();
    });
  }

  triggerFaasCreate() {
    const payload = this.form.value;
    payload.app = this.commonService.app._id;
    this.commonService.post('partnerManager', '/faas', payload).subscribe(res => {
      this.form.reset();
      this.ts.success('Function has been created.');
      this.appService.edit = res._id;
      this.router.navigate(['/app/', this.commonService.app._id, 'faas', res._id]);
    }, err => {
      this.form.reset();
      this.commonService.errorToast(err);
    });
  }

  getFaas() {
    return this.commonService.get('partnerManager', '/faas', this.apiConfig);
  }

  getFaasCount() {
    return this.commonService.get('partnerManager', '/faas/count', { filter: this.apiConfig.filter });
  }

  gridReady(event: GridReadyEvent) {
    this.sortModel = this.agGrid.api.getSortModel();
    this.agGrid.api.sizeColumnsToFit();
  }


  filterModified(event) {
    const filter = [];
    const filterModel = this.agGrid.api.getFilterModel();
    this.filterModel = filterModel;
    if (filterModel) {
      Object.keys(filterModel).forEach(key => {
        try {
          if (filterModel[key].filter) {
            filter.push(JSON.parse(filterModel[key].filter));
          }
        } catch (e) {
          console.error(e);
        }
      });
    }
    if (filter.length > 0) {
      this.apiConfig.filter = { $and: filter };
    } else {
      this.apiConfig.filter = null;
    }
    if (!environment.production) {
      console.log('Filter Modified', filterModel);
    }
  }

  sortChanged(event) {
    const sortModel = this.agGrid.api.getSortModel();
    this.sortModel = sortModel;
    if (!environment.production) {
      console.log('Sort Modified', sortModel);
    }
  }

  clearFilter() {
    this.filterModel = null;
    this.apiConfig.filter = null;
    this.agGrid.api.setFilterModel(null);
  }

  clearSort() {
    this.sortModel = null;
    this.agGrid.api.setSortModel([{ colId: 'name', sort: 'asc' }]);
  }


  get hasFilter() {
    if (this.filterModel) {
      return Object.keys(this.filterModel).length > 0;
    }
    return false;
  }

  get hasSort() {
    if (!this.sortModel
      || this.sortModel.findIndex(e => e.colId === 'name') === -1
      || this.sortModel.length !== 1) {
      return true;
    }
    return false;
  }

  canManageFaas(id: string) {
    if (this.commonService.isAppAdmin || this.commonService.userDetails.isSuperAdmin) {
      return true;
    } else {
      return this.hasPermission('PMF');
    }
  }

  canDeleteFaas(id: string) {
    return this.hasPermission('PMF');
  }

  hasPermission(type: string, entity?: string) {
    return this.commonService.hasPermission(type, entity);
  }
  hasWritePermission(entity: string) {
    return this.commonService.hasPermission('PMF', entity);
  }

}
